import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { TokenType } from 'core';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RoleType, Status } from 'shared';

import { CustomerService } from '@/modules/customer/customer.service';
import { UserService } from '@/modules/user/user.service';
import { ApiConfigService } from '@/shared/services';

import type { CustomerDocument } from '../customer/customer.entity';
import type { UserDocument } from '../user/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ApiConfigService,
    private userService: UserService,
    private customerService: CustomerService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.authConfig.publicKey,
    });
  }

  async validate(args: {
    userId: string;
    role: RoleType;
    type: TokenType;
    /** AUTH-1 — có claim này nghĩa là phiên mạo danh. Xem `impersonatedBy` bên dưới. */
    impersonatorId?: string;
  }): Promise<UserDocument | CustomerDocument> {
    if (args.type !== TokenType.ACCESS_TOKEN) {
      throw new UnauthorizedException();
    }

    // AUTH-1 BR-2: mạo danh được MỌI tài khoản, gồm cả tài khoản đã vô hiệu hoá
    // (người dùng chốt "bất kỳ" — hữu ích khi cần xem lại dữ liệu của nhân viên
    // đã nghỉ). Nên khi đang mạo danh thì BỎ QUA kiểm tra `status`. Không có
    // nhánh này thì mọi request trong phiên đó trả 400 và AC-03 trượt.
    const isImpersonating = Boolean(args.impersonatorId);

    // Token của tài khoản Customer Portal — load từ `customers`, KHÔNG phải
    // `users`. `role` được "giả lập" thủ công (CustomerEntity không có
    // roleId/RoleEntity) để RolesGuard/PermissionsGuard tái dùng nguyên vẹn.
    if (args.role === RoleType.Customer) {
      const customer = await this.customerService.getById(args.userId);
      if (!customer) throw new NotFoundException('Tài khoản không tồn tại');
      if (!isImpersonating && customer.status === Status.Inactive) {
        throw new BadRequestException('Your account is inactive, please contact support');
      }

      // @ts-expect-error hide password
      customer.password = undefined;
      // @ts-expect-error gắn role ảo — CustomerEntity không lưu roleId
      customer.role = { name: RoleType.Customer };
      if (isImpersonating) {
        customer.impersonatedBy = await this.resolveImpersonator(args.impersonatorId!);
      }

      return customer;
    }

    const user = await this.userService.getUserById(args.userId);

    if (!isImpersonating && user.status === Status.Inactive) {
      // throw new UnauthorizedException();
      throw new BadRequestException('Your account is inactive, please contact support');
    }

    // @ts-expect-error hide password
    user.password = undefined;
    if (isImpersonating) {
      user.impersonatedBy = await this.resolveImpersonator(args.impersonatorId!);
    }

    return user;
  }

  /**
   * Nạp danh tính SuperAdmin thật để đính kèm phiên mạo danh.
   *
   * CẢNH BÁO cho người sửa sau: `impersonatedBy` là field ĐỘNG đính lên document,
   * KHÔNG tồn tại trong schema Mongo. Nó sống sót qua guard và service vì đọc
   * thẳng từ instance, nhưng CHẾT ở mọi chỗ tuần tự hoá lại — `toObject()`,
   * `$project`, aggregation. Vì vậy `UserService.getMe()` và
   * `CustomerAuthController.me()` phải chép nó TƯỜNG MINH, y như cách `getMe()`
   * đang phải chép tay `role`/`customRole`. Xem `.devtasks/design/AUTH-1.md` §3.4.
   *
   * KHÔNG guard nào được đọc field này để cấp quyền — quyền trong phiên là quyền
   * của người bị mạo danh, không hơn (AC-07/BR-4).
   */
  private async resolveImpersonator(
    impersonatorId: string,
  ): Promise<{ _id: string; fullName?: string; email?: string } | undefined> {
    try {
      const actor = await this.userService.getUserById(impersonatorId);

      return { _id: String(actor._id), fullName: actor.fullName, email: actor.email };
    } catch {
      // SuperAdmin bị xoá giữa chừng: vẫn cho phiên chạy tiếp (không đá người
      // đang thao tác ra giữa chừng) nhưng giữ đúng _id để ghi vết AC-06.
      return { _id: impersonatorId };
    }
  }
}
