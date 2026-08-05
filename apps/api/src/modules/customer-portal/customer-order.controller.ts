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
  GetCustomerDashboardResDto,
  GetCustomerOrderProductTypesResDto,
  GetCustomerOrdersDto,
  GetCustomerOrdersResDto,
  GetCustomerOrderTrackResDto,
  PlaceCustomerOrderDto,
  PlaceCustomerOrderResDto,
  RoleType,
  UpdateCustomerOrderDto,
  UpdateCustomerOrderResDto,
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
  @ApiOperation({ summary: 'Khách hàng đặt đơn mới (chỉ thông tin cơ bản)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PlaceCustomerOrderResDto })
  async placeOrder(
    @Body() dto: PlaceCustomerOrderDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<PlaceCustomerOrderResDto> {
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/customer/orders', customerId: customer._id }),
    });
    return this.customerOrderService.placeOrder(customer, dto);
  }

  @Get()
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Danh sách đơn của khách hàng đang đăng nhập' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerOrdersResDto })
  async listOrders(
    @Query() dto: GetCustomerOrdersDto,
    @AuthUser() customer: CustomerDocument,
  ): Promise<GetCustomerOrdersResDto> {
    return this.customerOrderService.listOrders(customer, dto);
  }

  // 2 route static BẮT BUỘC khai TRƯỚC `:productionId` — Nest match theo thứ tự khai báo.
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

  @Get(':productionId')
  @Auth([RoleType.Customer])
  @ApiOperation({ summary: 'Xem tiến trình 1 đơn của khách hàng' })
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
  @ApiOperation({ summary: 'Khách sửa mockup/design/địa chỉ ship của 1 đơn đã đặt' })
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
