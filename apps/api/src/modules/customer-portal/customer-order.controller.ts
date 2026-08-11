import { ZodValidationPipe } from '@anatine/zod-nestjs';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CancelCustomerStagingOrderDto,
  CustomerStagingOrderResDto,
  GetCustomerDashboardResDto,
  GetCustomerOrderCountsResDto,
  GetCustomerOrderProductTypesResDto,
  GetCustomerOrderTrackResDto,
  GetCustomerStagingOrdersDto,
  GetCustomerStagingOrdersResDto,
  ImportCustomerOrdersDto,
  ImportCustomerOrdersResDto,
  PlaceCustomerOrderDto,
  PreviewPushCustomerOrdersResDto,
  PushCustomerOrdersDto,
  PushCustomerOrdersResDto,
  ResolveImportSkusDto,
  ResolveImportSkusResDto,
  RoleType,
  UpdateCustomerOrderDto,
  UpdateCustomerOrderResDto,
  UpdateCustomerStagingOrderDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';
import type { CustomerDocument } from '@/modules/customer/customer.entity';

import { CustomerOrderService } from './customer-order.service';

@Controller('customer/orders')
@ApiTags('customer-orders')
@UsePipes(ZodValidationPipe)
export class CustomerOrderController {
  constructor(
    private readonly customerOrderService: CustomerOrderService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post()
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Khách hàng đặt đơn mới → staging PENDING (chưa vào sản xuất)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CustomerStagingOrderResDto })
  async placeOrder(
    @Body() dto: PlaceCustomerOrderDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<CustomerStagingOrderResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/customer/orders', customerId: customer._id }),
    });
    return this.customerOrderService.placeOrder(customer, dto);
  }

  @Get()
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Danh sách ĐƠN khách (staging + derive 8 trạng thái, 1 đơn nhiều item)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerStagingOrdersResDto })
  async listOrders(
    @Query() dto: GetCustomerStagingOrdersDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<GetCustomerStagingOrdersResDto> {
    return this.customerOrderService.listOrders(customer, dto);
  }

  // Các route static BẮT BUỘC khai TRƯỚC `:productionId` — Nest match theo thứ tự khai báo.
  @Get('counts')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Đếm đơn theo 8 trạng thái + badge held/rework (tab bar listing)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerOrderCountsResDto })
  async getCounts(@AuthUser() customer: CustomerDocument): Promise<GetCustomerOrderCountsResDto> {
    return this.customerOrderService.getCounts(customer);
  }

  @Get('product-types')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Distinct sản phẩm khách đã đặt — option filter listing' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerOrderProductTypesResDto })
  async listProductTypes(@AuthUser() customer: CustomerDocument): Promise<GetCustomerOrderProductTypesResDto> {
    return this.customerOrderService.listProductTypes(customer);
  }

  @Get('dashboard')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Dashboard Customer Portal — tổng quan đơn + đơn gần đây' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerDashboardResDto })
  async getDashboard(@AuthUser() customer: CustomerDocument): Promise<GetCustomerDashboardResDto> {
    return this.customerOrderService.getDashboard(customer);
  }

  @Post('import/resolve')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Đối chiếu SKU với catalog cho preview import (tên/ảnh/giá tham khảo)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResolveImportSkusResDto })
  async resolveImportSkus(
    @Body() dto: ResolveImportSkusDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<ResolveImportSkusResDto> {
    return this.customerOrderService.resolveImportSkus(customer, dto);
  }

  @Post('import')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Import CSV/XLSX theo template OnosPod cũ → staging PENDING (group theo (order_id, identifier))' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ImportCustomerOrdersResDto })
  async importOrders(
    @Body() dto: ImportCustomerOrdersDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<ImportCustomerOrdersResDto> {
    this.logger.info({
      message: JSON.stringify({
        method: 'POST',
        url: '/customer/orders/import',
        customerId: customer._id,
        orders: dto.orders.length,
      }),
    });
    return this.customerOrderService.importOrdersCsv(customer, dto);
  }

  @Post('push-preview')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Xem bảng giá chốt trước khi Push to production (không commit)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PreviewPushCustomerOrdersResDto })
  async previewPush(
    @Body() dto: PushCustomerOrdersDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<PreviewPushCustomerOrdersResDto> {
    return this.customerOrderService.previewPush(customer, dto);
  }

  @Post('push')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Push to production — chốt giá + ledger + đẩy vào pipeline sản xuất' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PushCustomerOrdersResDto })
  async pushToProduction(
    @Body() dto: PushCustomerOrdersDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<PushCustomerOrdersResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/customer/orders/push', customerId: customer._id, ids: dto.ids }),
    });
    return this.customerOrderService.pushToProduction(customer, dto);
  }

  @Patch('staging/:id')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Sửa đơn PENDING tự do (thông tin đơn/địa chỉ/items)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CustomerStagingOrderResDto })
  async updateStagingOrder(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerStagingOrderDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<CustomerStagingOrderResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'PATCH', url: `/customer/orders/staging/${id}`, customerId: customer._id }),
    });
    return this.customerOrderService.updateStagingOrder(customer, id, dto);
  }

  @Post('staging/:id/cancel')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Hủy đơn PENDING (trước push — miễn phí, không refund)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CustomerStagingOrderResDto })
  async cancelStagingOrder(
    @Param('id') id: string,
    @Body() dto: CancelCustomerStagingOrderDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<CustomerStagingOrderResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: `/customer/orders/staging/${id}/cancel`, customerId: customer._id }),
    });
    return this.customerOrderService.cancelStagingOrder(customer, id, dto);
  }

  @Get(':productionId')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Xem tiến trình 1 đơn sản xuất (item đã push) của khách hàng' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerOrderTrackResDto })
  async trackOrder(
    @Param('productionId') productionId: string,
    @AuthUser() customer: CustomerDocument,
  ): Promise<GetCustomerOrderTrackResDto> {
    return this.customerOrderService.trackOrder(customer, productionId);
  }

  @Patch(':productionId')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Khách sửa mockup/design/địa chỉ ship của 1 đơn ĐÃ PUSH' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateCustomerOrderResDto })
  async updateOrder(
    @Param('productionId') productionId: string,
    @Body() dto: UpdateCustomerOrderDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<UpdateCustomerOrderResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'PATCH', url: `/customer/orders/${productionId}`, customerId: customer._id }),
    });
    return this.customerOrderService.updateOrder(customer, productionId, dto);
  }
}
