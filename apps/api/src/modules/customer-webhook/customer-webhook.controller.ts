import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreateCustomerWebhookDto,
  CreateCustomerWebhookResDto,
  DeleteCustomerWebhookResDto,
  ListCustomerWebhooksResDto,
  RoleType,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';
import type { CustomerDocument } from '@/modules/customer/customer.entity';

import { CustomerWebhookService } from './customer-webhook.service';

/** Webhook CRUD — khách tự phục vụ ở portal (JWT Customer, prefix `customer/` theo RolesGuard). */
@Controller('customer/webhooks')
@ApiTags('customer-webhooks')
@UsePipes(ZodValidationPipe)
export class CustomerWebhookController {
  constructor(
    private readonly customerWebhookService: CustomerWebhookService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Danh sách webhook của khách (kèm secret để verify chữ ký)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ListCustomerWebhooksResDto })
  async list(@AuthUser() customer: CustomerDocument): Promise<ListCustomerWebhooksResDto> {
    return this.customerWebhookService.list(String(customer._id));
  }

  @Post()
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Đăng ký webhook URL nhận sự kiện đổi trạng thái đơn' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateCustomerWebhookResDto })
  async create(
    @Body() dto: CreateCustomerWebhookDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<CreateCustomerWebhookResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/customer/webhooks', customerId: customer._id }),
    });
    return this.customerWebhookService.create(String(customer._id), dto);
  }

  @Delete(':id')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Xóa webhook' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeleteCustomerWebhookResDto })
  async remove(@Param('id') id: string, @AuthUser() customer: CustomerDocument): Promise<DeleteCustomerWebhookResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'DELETE', url: `/customer/webhooks/${id}`, customerId: customer._id }),
    });
    return this.customerWebhookService.remove(String(customer._id), id);
  }
}
