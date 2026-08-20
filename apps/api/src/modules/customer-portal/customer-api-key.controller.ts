import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreateCustomerApiKeyDto,
  CreateCustomerApiKeyResDto,
  ListCustomerApiKeysResDto,
  RevokeCustomerApiKeyResDto,
  RoleType,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';
import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { CustomerService } from '@/modules/customer/customer.service';

/**
 * API keys tự phục vụ ở portal (ORD-4, plan §7) — JWT Customer, prefix
 * `customer/` theo RolesGuard. Key plain trả đúng MỘT lần lúc tạo.
 */
@Controller('customer/api-keys')
@ApiTags('customer-api-keys')
@UsePipes(ZodValidationPipe)
export class CustomerApiKeyController {
  constructor(
    private readonly customerService: CustomerService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Danh sách API key hoạt động (nhãn + prefix + lần dùng cuối)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ListCustomerApiKeysResDto })
  async list(@AuthUser() customer: CustomerDocument): Promise<ListCustomerApiKeysResDto> {
    return this.customerService.listApiKeys(String(customer._id));
  }

  @Post()
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Tạo API key mới — key plain hiển thị đúng MỘT lần' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateCustomerApiKeyResDto })
  async create(
    @Body() dto: CreateCustomerApiKeyDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<CreateCustomerApiKeyResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/customer/api-keys', customerId: customer._id }),
    });
    return this.customerService.createApiKey(String(customer._id), dto);
  }

  @Delete(':id')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Thu hồi API key — vô hiệu ngay lập tức' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RevokeCustomerApiKeyResDto })
  async revoke(@Param('id') id: string, @AuthUser() customer: CustomerDocument): Promise<RevokeCustomerApiKeyResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'DELETE', url: `/customer/api-keys/${id}`, customerId: customer._id }),
    });
    return this.customerService.revokeApiKey(String(customer._id), id);
  }
}
