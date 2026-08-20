import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Patch, Post, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from 'core';
import {
  ChangeCustomerPasswordDto,
  ChangeCustomerPasswordResDto,
  CustomerLoginDto,
  CustomerLoginResDto,
  CustomerRegisterDto,
  CustomerRegisterResDto,
  GetCustomerMeResDto,
  myNanoid,
  RoleType,
  StopImpersonationResDto,
  UpdateCustomerMeDto,
  UpdateCustomerMeResDto,
} from 'shared';
import { Logger } from 'winston';

import { AccessToken, Auth, ClientIp, UserAgent } from '@/decorators';
import { AuthService } from '@/modules/auth/auth.service';
import { ImpersonationService } from '@/modules/auth/impersonation.service';
import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { CustomerService, toSafeCustomer } from '@/modules/customer/customer.service';

@Controller('customer/auth')
@ApiTags('customer-auth')
@UsePipes(ZodValidationPipe)
export class CustomerAuthController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly authService: AuthService,
    // AUTH-3 — dùng CHUNG service dừng mạo danh với `POST /auth/impersonate/stop`,
    // không nhân bản logic: sửa quy tắc dừng chỉ có đúng một chỗ để sửa.
    private readonly impersonationService: ImpersonationService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @ApiOperation({ summary: 'Khách hàng đăng ký tài khoản Customer Portal' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CustomerRegisterResDto })
  async register(@Body() dto: CustomerRegisterDto): Promise<CustomerRegisterResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/customer/auth/register', email: dto.userEmail }),
    });
    return { success: true, data: await this.customerService.register(dto) };
  }

  @Post('login')
  @Throttle({ default: { limit: 100, ttl: 900_000 } })
  @ApiOperation({ summary: 'Khách hàng đăng nhập Customer Portal' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CustomerLoginResDto })
  async login(@Body() dto: CustomerLoginDto): Promise<CustomerLoginResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/customer/auth/login', email: dto.userEmail }),
    });

    const customer = await this.customerService.validateLogin(dto);
    const sessionId = myNanoid();
    const token = await this.authService.createAccessToken({
      userId: customer._id.toString(),
      role: RoleType.Customer,
      sessionId,
      rememberMe: dto.rememberMe,
    });

    return {
      success: true,
      userId: customer._id.toString(),
      accessToken: token.accessToken,
      expiresIn: token.expiresIn,
      user: toSafeCustomer(customer),
    };
  }

  @Get('me')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Thông tin tài khoản khách hàng hiện tại' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerMeResDto })
  me(@AuthUser() customer: CustomerDocument): GetCustomerMeResDto {
    // AUTH-1 — `toSafeCustomer()` chạy `toObject()` nên CHỈ giữ path có trong
    // schema; `impersonatedBy` là field ĐỘNG do JwtStrategy đính nên không sống
    // sót. Phải ghép tường minh, nếu không dải cảnh báo "đang mạo danh ai" mất
    // hẳn trong Customer Portal → trượt vế "kể cả Customer Portal" của AC-04.
    const impersonatedBy = customer.impersonatedBy;

    return { success: true, data: { ...toSafeCustomer(customer), ...(impersonatedBy ? { impersonatedBy } : {}) } };
  }

  @Patch('me')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Khách tự sửa hồ sơ (fullName/phone) — trang Tài khoản của tôi' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateCustomerMeResDto })
  async updateMe(
    @Body() dto: UpdateCustomerMeDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<UpdateCustomerMeResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'PATCH', url: '/customer/auth/me', customerId: customer._id }),
    });
    return { success: true, data: await this.customerService.updateMe(customer._id.toString(), dto) };
  }

  @Post('change-password')
  @Auth([RoleType.Customer])
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ApiOperation({ summary: 'Khách tự đổi mật khẩu — bắt buộc nhập đúng mật khẩu hiện tại' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ChangeCustomerPasswordResDto })
  async changePassword(
    @Body() dto: ChangeCustomerPasswordDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<ChangeCustomerPasswordResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/customer/auth/change-password', customerId: customer._id }),
    });
    await this.customerService.changePassword(customer._id.toString(), dto);
    return { success: true, data: { changed: true } };
  }

  /**
   * AUTH-3 — thoát phiên mạo danh KHÁCH HÀNG. Cùng một việc với
   * `POST /auth/impersonate/stop` (AUTH-1) và gọi ĐÚNG service đó, chỉ khác chỗ
   * đứng: token của phiên mạo danh khách mang role `Customer`, mà `RolesGuard`
   * chặn cứng role đó khỏi mọi URL không chứa `/customer/` — nên đường thoát
   * cũ trả 403. Cách sửa là đưa đường thoát VÀO TRONG rào, KHÔNG nới rào
   * (`CUSTOMER_ALLOWED_PREFIXES` giữ nguyên `['/customer/']`).
   *
   * `public: true` giữ đúng tính chất của đường cũ: token mạo danh có thể ĐÃ
   * HẾT HẠN lúc bấm thoát — chặn nó là nhốt người dùng trong chính phiên mà
   * đường thoát sinh ra để cứu. Hàng rào thật nằm trong service: token khách
   * THẬT không có claim `impersonatorId` nên bị từ chối ngay, không có đường
   * nào đổi token khách lấy token nhân viên.
   */
  @Post('impersonate/stop')
  @Auth([], [], { public: true })
  @ApiOperation({ summary: 'Thoát phiên mạo danh khách hàng, trả về token SuperAdmin ban đầu' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StopImpersonationResDto })
  async stopImpersonation(
    @AccessToken() accessToken: string,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<StopImpersonationResDto> {
    this.logger.info({
      message: JSON.stringify({ action: 'stopImpersonation', method: 'POST', url: '/customer/auth/impersonate/stop' }),
    });

    return { success: true, data: await this.impersonationService.stop(accessToken, { ip, userAgent }) };
  }
}
