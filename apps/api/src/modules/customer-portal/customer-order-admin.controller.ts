import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleType } from 'shared';
import {
  GetAdminCustomerOrderCountsDto,
  GetAdminCustomerOrdersDto,
  GetAdminCustomerOrdersResDto,
  GetAdminCustomerOrderStatsResDto,
  GetCustomerOrderCountsResDto,
} from 'shared';

import { Auth } from '@/decorators';

import { CustomerOrderService } from './customer-order.service';

/**
 * Khu quản trị `/hub` trong Seller Portal (SellerPortal.md §9) — nhân viên
 * Admin/SuperAdmin đọc đơn staging của MỌI seller. CHỈ ĐỌC; mọi thao tác trên
 * đơn khách đi qua mạo danh (token khách) để giữ rào + audit sẵn có.
 * Prefix `admin/...` cố ý KHÔNG chứa `/customer/` → RolesGuard chặn token khách.
 */
@ApiTags('customer-orders-admin')
@Controller('admin/customer-orders')
@UsePipes(ZodValidationPipe)
export class CustomerOrderAdminController {
  constructor(private readonly customerOrderService: CustomerOrderService) {}

  @Get()
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Đơn khách (staging) của mọi seller — lọc seller/trạng thái/dòng/held/search' })
  @ApiOkResponse({ type: GetAdminCustomerOrdersResDto })
  list(@Query() dto: GetAdminCustomerOrdersDto): Promise<GetAdminCustomerOrdersResDto> {
    return this.customerOrderService.listOrdersAdmin(dto);
  }

  @Get('counts')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Đếm đơn khách theo trạng thái/dòng — toàn hệ hoặc 1 seller' })
  @ApiOkResponse({ type: GetCustomerOrderCountsResDto })
  counts(@Query() dto: GetAdminCustomerOrderCountsDto): Promise<GetCustomerOrderCountsResDto> {
    return this.customerOrderService.getCountsAdmin(dto);
  }

  @Get('stats')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Dashboard khu quản trị seller: đếm toàn hệ + top seller + đơn mới' })
  @ApiOkResponse({ type: GetAdminCustomerOrderStatsResDto })
  stats(): Promise<GetAdminCustomerOrderStatsResDto> {
    return this.customerOrderService.getStatsAdmin();
  }
}
