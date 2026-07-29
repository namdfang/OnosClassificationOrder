import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  GetSentCustomerNotificationsDto,
  GetSentCustomerNotificationsResDto,
  RoleType,
  SendCustomerNotificationDto,
  SendCustomerNotificationResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';
import type { UserDocument } from '@/modules/user/user.entity';

import { CustomerNotificationService } from './customer-notification.service';

/** Admin/nội bộ soạn + gửi thông báo cho khách hàng — xem `CustomerPortal.md §9`. */
@Controller('customer-notifications')
@ApiTags('customer-notifications')
@UsePipes(ZodValidationPipe)
export class CustomerNotificationController {
  constructor(
    private readonly customerNotificationService: CustomerNotificationService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post()
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Gửi thông báo cho 1 khách hàng hoặc broadcast tất cả' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SendCustomerNotificationResDto })
  async send(
    @Body() dto: SendCustomerNotificationDto,
    @AuthUser() user: UserDocument,
  ): Promise<SendCustomerNotificationResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/customer-notifications', userId: user._id, customerId: dto.customerId }),
    });
    return this.customerNotificationService.send(user, dto);
  }

  @Get('sent')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Lịch sử thông báo đã gửi cho khách hàng' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetSentCustomerNotificationsResDto })
  async listSent(@Query() dto: GetSentCustomerNotificationsDto): Promise<GetSentCustomerNotificationsResDto> {
    return this.customerNotificationService.listSent(dto);
  }
}
