import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Controller, Get, HttpCode, HttpStatus, Post, Query, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  GetCustomerNotificationsDto,
  GetCustomerNotificationsResDto,
  MarkCustomerNotificationsReadResDto,
  RoleType,
} from 'shared';

import { Auth } from '@/decorators';
import type { CustomerDocument } from '@/modules/customer/customer.entity';

import { CustomerNotificationService } from './customer-notification.service';

/** Khách hàng xem thông báo của chính mình (broadcast + gửi riêng) — chuông ở `CustomerLayout.tsx`. */
@Controller('customer/notifications')
@ApiTags('customer-notifications')
@UsePipes(ZodValidationPipe)
export class CustomerNotificationPortalController {
  constructor(private readonly customerNotificationService: CustomerNotificationService) {}

  @Get()
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Thông báo của khách hàng đang đăng nhập + số chưa đọc' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerNotificationsResDto })
  async list(
    @Query() dto: GetCustomerNotificationsDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<GetCustomerNotificationsResDto> {
    return this.customerNotificationService.listForCustomer(customer, dto);
  }

  @Post('read')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Đánh dấu toàn bộ thông báo hiện có là đã đọc' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MarkCustomerNotificationsReadResDto })
  async markRead(@AuthUser() customer: CustomerDocument): Promise<MarkCustomerNotificationsReadResDto> {
    return this.customerNotificationService.markRead(customer);
  }
}
