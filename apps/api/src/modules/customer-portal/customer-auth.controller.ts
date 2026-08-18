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
  UpdateCustomerMeDto,
  UpdateCustomerMeResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';
import { AuthService } from '@/modules/auth/auth.service';
import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { CustomerService, toSafeCustomer } from '@/modules/customer/customer.service';

@Controller('customer/auth')
@ApiTags('customer-auth')
@UsePipes(ZodValidationPipe)
export class CustomerAuthController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly authService: AuthService,
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
}
