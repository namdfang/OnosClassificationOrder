import { ZodValidationPipe } from '@anatine/zod-nestjs';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  GetCustomerStagingOrdersDto,
  GetCustomerStagingOrdersResDto,
  ImportCustomerOrdersDto,
  ImportCustomerOrdersResDto,
  OpenApiCreateOrdersDto,
  OpenApiGetOrderResDto,
  OpenApiPushOrdersDto,
  PushCustomerOrdersResDto,
} from 'shared';
import { Logger } from 'winston';

import { ApiKeyGuard } from '@/guards';
import type { CustomerDocument } from '@/modules/customer/customer.entity';

import { CustomerOrderService } from './customer-order.service';

/**
 * Public Order API (ORD-4, plan §8) — cho HỆ THỐNG của khách kỹ thuật gọi.
 * Xác thực bằng API key (`X-Api-Key`, xem `ApiKeyGuard`), KHÔNG JWT, KHÔNG
 * @Auth. Mọi endpoint chỉ nhìn/đụng dữ liệu của CHÍNH khách sở hữu key —
 * adapter mỏng trên đúng các service method portal đang dùng (đơn API sau
 * push không phân biệt gì với đơn form/CSV).
 * URL đầy đủ: `/api/v1/open-api/orders...` (global prefix `api/v1`).
 */
@Controller('open-api/orders')
@ApiTags('open-api')
@ApiHeader({ name: 'X-Api-Key', description: 'API key của khách (onos_live_…)' })
@UseGuards(ApiKeyGuard)
@UsePipes(ZodValidationPipe)
export class CustomerOpenApiController {
  constructor(
    private readonly customerOrderService: CustomerOrderService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Tạo đơn Pending theo lô (≤100 đơn/lần) — idempotent theo externalRef' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ImportCustomerOrdersResDto })
  async createOrders(
    @Body() dto: OpenApiCreateOrdersDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<ImportCustomerOrdersResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: '/open-api/orders',
        customerId: customer._id,
        orders: dto.orders.length,
      }),
    });
    // Map externalRef → orderId (orderKey = normalize(externalRef|'')), tái dùng
    // NGUYÊN luồng import CSV: validate SKU + giá tham khảo + productionId cấp ngay.
    const orders: ImportCustomerOrdersDto['orders'] = dto.orders.map((o) => ({
      orderId: o.externalRef,
      orderName: o.orderName,
      note: o.note,
      shippingAddress: o.shippingAddress,
      items: o.items,
    }));
    return this.customerOrderService.importOrdersCsv(customer, { orders } as ImportCustomerOrdersDto, 'api');
  }

  @Post('push')
  @ApiOperation({ summary: 'Push đơn sang sản xuất theo externalRefs / staging ids' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PushCustomerOrdersResDto })
  async pushOrders(
    @Body() dto: OpenApiPushOrdersDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<PushCustomerOrdersResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/open-api/orders/push', customerId: customer._id }),
    });
    const ids = await this.customerOrderService.resolveStagingIdsForApi(customer, dto);
    if (ids.length === 0) return { success: true, data: { results: [], totalAmount: 0 } };
    return this.customerOrderService.pushToProduction(customer, { ids });
  }

  @Get()
  @ApiOperation({ summary: 'List đơn của khách sở hữu key (8 trạng thái derive + badge held/rework)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerStagingOrdersResDto })
  async listOrders(
    @Query() dto: GetCustomerStagingOrdersDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<GetCustomerStagingOrdersResDto> {
    return this.customerOrderService.listOrders(customer, dto);
  }

  @Get(':ref')
  @ApiOperation({ summary: 'Tra 1 đơn theo externalRef hoặc productionId — status + timeline' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OpenApiGetOrderResDto })
  async getOrder(@Param('ref') ref: string, @AuthUser() customer: CustomerDocument): Promise<OpenApiGetOrderResDto> {
    return this.customerOrderService.getOrderByRefForApi(customer, ref);
  }
}
