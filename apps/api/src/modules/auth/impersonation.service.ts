import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { generateHash } from 'core';
import { Model } from 'mongoose';
import { ActionType, IMPERSONATION_EXPIRED_CODE, myNanoid, RoleType } from 'shared';

import { CustomerEntity } from '@/modules/customer/customer.entity';
import { UserEntity } from '@/modules/user/user.entity';
import { UserService } from '@/modules/user/user.service';
import { ApiConfigService } from '@/shared/services';

import { ActionRepository } from '../actions/action.repository';
import { AuthService } from './auth.service';

/** Mật khẩu đặt cho tài khoản CHƯA có mật khẩu khi bị mạo danh (BR-8/AC-11). */
const DEFAULT_IMPERSONATION_PASSWORD = 'abc123456';

/** Bản ghi coi như CHƯA có mật khẩu — dùng làm FILTER, không đọc-rồi-so (xem `ensurePassword`). */
const EMPTY_PASSWORD_CLAUSE = [{ password: { $exists: false } }, { password: null }, { password: '' }];

type TargetType = 'user' | 'customer';

interface ImpersonationClaims {
  userId: string;
  role: RoleType;
  sessionId: string;
  impersonatorId?: string;
  iat?: number;
}

/**
 * AUTH-1 — SuperAdmin mạo danh tài khoản khác.
 *
 * Nguyên tắc xuyên suốt: **danh tính hiệu lực trong phiên là người bị mạo danh**,
 * SuperAdmin chỉ là siêu dữ liệu đi kèm. Token mang `role` của người bị mạo danh
 * và `JwtStrategy` load chính họ, nên guard/service không hề biết có mạo danh →
 * quyền SuperAdmin KHÔNG có đường nào rò rỉ vào phiên (AC-07/BR-4). Không guard
 * nào được đọc `impersonatorId` để cấp quyền.
 *
 * Thiết kế đầy đủ: `.devtasks/design/AUTH-1.md`.
 */
@Injectable()
export class ImpersonationService {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ApiConfigService,
    private readonly actionRepository: ActionRepository,
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
    @InjectModel(CustomerEntity.name) private readonly customerModel: Model<CustomerEntity>,
  ) {}

  /**
   * Bắt đầu phiên mạo danh.
   *
   * `actorImpersonatorId` là claim của token GỌI ĐẾN — có giá trị nghĩa là người
   * gọi đang ở trong một phiên mạo danh rồi, và mạo danh lồng nhau bị cấm (BR-6/AC-08).
   */
  async start(
    actor: { _id: unknown; role?: { name?: string } },
    dto: { targetType: TargetType; targetId: string },
    ctx: { ip: string; userAgent: string; actorImpersonatorId?: string },
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    impersonating: { _id: string; fullName?: string; email?: string; targetType: TargetType };
  }> {
    const actorId = String(actor._id);

    // BR-1 + AC-02: kiểm quyền TƯỜNG MINH ở đây thay vì chỉ dựa vào `@Auth`.
    // Guard ném trước khi vào controller nên không có chỗ nào ghi lại lần thử —
    // mà AC-02 đòi VỪA từ chối VỪA ghi vết. Đánh đổi có ý thức, chỉ áp cho
    // endpoint này; ĐỪNG nhân rộng mẫu này ra các endpoint khác.
    if (actor.role?.name !== RoleType.SuperAdmin) {
      await this.writeAction(ActionType.ImpersonateRejected, actorId, ctx, {
        targetUserId: dto.targetId,
        targetType: dto.targetType,
      });
      throw new ForbiddenException('Chỉ SuperAdmin được dùng chức năng mạo danh');
    }

    if (ctx.actorImpersonatorId) {
      throw new BadRequestException('Đang ở phiên mạo danh, không thể mạo danh tiếp');
    }

    const target = await this.loadTarget(dto.targetType, dto.targetId);

    // BR-8: đặt mật khẩu mặc định nếu tài khoản chưa từng có mật khẩu.
    await this.ensurePassword(dto.targetType, dto.targetId, actorId, ctx);

    // sessionId MỚI — BẮT BUỘC. Cache token khoá theo `token:${sessionId}:${userId}`
    // và `clearTokens()` xoá theo đúng khoá đó, nên tái dùng sessionId của phiên
    // thật sẽ đá người bị mạo danh (hoặc chính SuperAdmin) ra — hỏng AC-10/BR-14.
    const sessionId = myNanoid();
    const token = await this.authService.createAccessToken({
      role: dto.targetType === 'customer' ? RoleType.Customer : ((target.roleName as RoleType) ?? RoleType.Seller),
      userId: dto.targetId,
      sessionId,
      impersonatorId: actorId,
    });

    await this.writeAction(ActionType.Impersonate, actorId, ctx, {
      targetUserId: dto.targetId,
      targetType: dto.targetType,
      sessionId,
      active: true,
    });

    return {
      accessToken: token.accessToken,
      expiresIn: token.expiresIn,
      impersonating: {
        _id: dto.targetId,
        fullName: target.fullName,
        email: target.email,
        targetType: dto.targetType,
      },
    };
  }

  /**
   * Thoát phiên mạo danh → cấp token SuperAdmin MỚI (BR-9: không bắt đăng nhập lại).
   *
   * Xác thực **chữ ký thôi, BỎ QUA HẠN**. Nếu đòi token còn hạn thì token hết hạn
   * sẽ không thoát được, và AC-09 trượt đúng tại kịch bản nó sinh ra để bảo vệ.
   * Bù lại là 3 lớp siết bên dưới — thiếu bất kỳ lớp nào thì token mạo danh cũ
   * trở thành vé đổi ra quyền SuperAdmin vô thời hạn.
   */
  async stop(
    rawToken: string,
    ctx: { ip: string; userAgent: string },
  ): Promise<{ accessToken: string; expiresIn: number }> {
    let claims: ImpersonationClaims;
    try {
      claims = this.jwtService.verify<ImpersonationClaims>(rawToken, {
        publicKey: this.configService.authConfig.publicKey,
        ignoreExpiration: true,
      });
    } catch {
      throw new BadRequestException('Token không hợp lệ');
    }

    if (!claims.impersonatorId) {
      throw new BadRequestException('Phiên hiện tại không phải phiên mạo danh');
    }

    // Lớp 3 — chặn cứng theo thời điểm phát token. `iat` tính bằng giây.
    const maxAge = this.configService.authConfig.impersonationExchangeMaxAge;
    if (claims.iat && Date.now() / 1000 - claims.iat > maxAge) {
      throw new BadRequestException(IMPERSONATION_EXPIRED_CODE);
    }

    // Lớp 2 — phiên phải còn bản ghi CHƯA đánh dấu kết thúc. Đây cũng chính là
    // bản ghi AC-05 cần, nên không tốn thêm hạ tầng nào.
    const session = await this.actionRepository.findOne({
      sessionId: claims.sessionId,
      type: ActionType.Impersonate,
      active: true,
    });
    if (!session) {
      throw new BadRequestException(IMPERSONATION_EXPIRED_CODE);
    }

    // Lớp 1 — đọc lại SuperAdmin NGAY LÚC THOÁT: còn đúng role và còn hoạt động.
    // Bị hạ quyền/khoá trong lúc mạo danh thì không được cấp lại token.
    const impersonator = await this.userService.getUserById(claims.impersonatorId).catch(() => null);
    if (!impersonator || impersonator.role?.name !== RoleType.SuperAdmin) {
      throw new ForbiddenException('Tài khoản không còn quyền SuperAdmin, vui lòng đăng nhập lại');
    }

    await this.actionRepository.updateMany(
      { sessionId: claims.sessionId, type: ActionType.Impersonate },
      { active: false, endedAt: new Date() },
    );
    await this.writeAction(ActionType.ImpersonateStop, claims.impersonatorId, ctx, {
      targetUserId: claims.userId,
      sessionId: claims.sessionId,
    });

    const token = await this.authService.createAccessToken({
      role: RoleType.SuperAdmin,
      userId: claims.impersonatorId,
      sessionId: myNanoid(),
    });

    return { accessToken: token.accessToken, expiresIn: token.expiresIn };
  }

  /** Đọc tài khoản đích. KHÔNG chặn tài khoản vô hiệu hoá — BR-2 cho mạo danh mọi tài khoản. */
  private async loadTarget(
    targetType: TargetType,
    targetId: string,
  ): Promise<{ fullName?: string; email?: string; roleName?: string }> {
    if (targetType === 'customer') {
      const customer = await this.customerModel.findById(targetId).select('-password').lean();
      if (!customer) throw new NotFoundException('Tài khoản khách hàng không tồn tại');

      return { fullName: customer.fullName, email: customer.userEmail };
    }

    const user = await this.userService.getUserById(targetId).catch(() => null);
    if (!user) throw new NotFoundException('Tài khoản không tồn tại');

    return { fullName: user.fullName, email: user.email, roleName: user.role?.name };
  }

  /**
   * BR-8/AC-11/AC-12 — đặt mật khẩu mặc định CHỈ khi tài khoản chưa từng có.
   *
   * Điều kiện "chưa có mật khẩu" nằm NGAY TRONG FILTER chứ không đọc-rồi-ghi:
   * đọc rồi ghi có khe đua — giữa lúc đọc và lúc ghi, chính chủ có thể vừa đặt
   * mật khẩu, và ghi đè lên là khoá họ khỏi tài khoản của chính họ (AC-12).
   * Filter điều kiện gộp kiểm tra + ghi thành một thao tác nguyên tử của MongoDB.
   *
   * Với `customers` còn set `passwordSource: 'system'` để `register()` biết đây
   * là mật khẩu do hệ thống đặt và vẫn cho chính chủ claim đè (AC-14/BR-15).
   */
  private async ensurePassword(
    targetType: TargetType,
    targetId: string,
    actorId: string,
    ctx: { ip: string; userAgent: string },
  ): Promise<void> {
    const passwordHash = generateHash(DEFAULT_IMPERSONATION_PASSWORD);
    const filter = { _id: targetId, $or: EMPTY_PASSWORD_CLAUSE };

    const res =
      targetType === 'customer'
        ? await this.customerModel.updateOne(filter, { $set: { password: passwordHash, passwordSource: 'system' } })
        : await this.userModel.updateOne(filter, { $set: { password: passwordHash } });

    // modifiedCount === 0 nghĩa là tài khoản ĐÃ có mật khẩu → không đụng tới, và
    // cũng không ghi vết (không có gì xảy ra để mà ghi).
    if (res.modifiedCount > 0) {
      await this.writeAction(ActionType.ImpersonatePasswordSet, actorId, ctx, {
        targetUserId: targetId,
        targetType,
      });
    }
  }

  private async writeAction(
    type: (typeof ActionType)[keyof typeof ActionType],
    userId: string,
    ctx: { ip: string; userAgent: string },
    extra: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.actionRepository.create({ ip: ctx.ip, userAgent: ctx.userAgent, type, userId, ...extra } as never);
    } catch (err) {
      // Ghi vết hỏng KHÔNG được làm hỏng chính thao tác — cùng cách order-log đang làm.
      console.warn('[impersonation] write action failed', err);
    }
  }
}
