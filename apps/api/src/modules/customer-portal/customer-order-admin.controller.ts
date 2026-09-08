import { ZodValidationPipe } from '@anatine/zod-nestjs';
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Post, Query, UsePipes } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleType } from 'shared';
import {
  AdminPlaceOrderForDto,
  CustomerStagingOrderResDto,
  GetAdminCustomerOrderCountsDto,
  GetAdminCustomerOrdersDto,
  GetAdminCustomerOrdersResDto,
  GetAdminCustomerOrderStatsResDto,
  GetCustomerCatalogDto,
  GetCustomerCatalogResDto,
  GetCustomerOrderCountsResDto,
  PlaceCustomerOrderDto,
  PushCustomerOrdersDto,
  PushCustomerOrdersResDto,
} from 'shared';

import { Auth } from '@/decorators';

import { CustomerService } from '../customer/customer.service';
import { CustomerCatalogService } from './customer-catalog.service';
import { CustomerOrderService } from './customer-order.service';

/**
 * Khu quản trị `/hub` trong Seller Portal (SellerPortal.md §9) — nhân viên
 * Admin/SuperAdmin đọc đơn staging của MỌI seller. CHỈ ĐỌC; mọi thao tác trên
 * đơn khách trước đây phải đi qua mạo danh; từ 08/09/2026 ops **lên đơn và đẩy
 * đơn thay seller** ngay tại hub (khuôn `mode="staff"` của wizard thghub) qua
 * hai endpoint dưới — vẫn gọi CHÍNH `placeOrder`/`pushToProduction` mà seller
 * dùng, chỉ khác ở chỗ khách được nạp theo `customerId` thay vì token.
 * Prefix `admin/...` cố ý KHÔNG chứa `/customer/` → RolesGuard chặn token khách.
 */
@ApiTags('customer-orders-admin')
@Controller('admin/customer-orders')
@UsePipes(ZodValidationPipe)
export class CustomerOrderAdminController {
  constructor(
    private readonly customerOrderService: CustomerOrderService,
    private readonly customerService: CustomerService,
    private readonly customerCatalogService: CustomerCatalogService,
  ) {}

  /** Nạp seller đích; khách đã xoá mềm/khoá thì không cho đặt hộ. */
  private async target(customerId: string) {
    const customer = await this.customerService.getById(customerId);
    if (!customer || customer.deletedAt) throw new NotFoundException('Không tìm thấy seller.');

    return customer;
  }

  @Get('catalog')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Catalog theo tier của seller đích — ops đặt đơn hộ phải thấy ĐÚNG giá seller thấy' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetCustomerCatalogResDto })
  async catalogFor(
    @Query() q: AdminPlaceOrderForDto,
    @Query() dto: GetCustomerCatalogDto,
  ): Promise<GetCustomerCatalogResDto> {
    // Cùng service của portal khách → giá/khuyến mãi/cổng hiển thị y hệt, khỏi lệch.
    return this.customerCatalogService.getCatalog(await this.target(q.customerId), dto);
  }

  @Post()
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Ops đặt đơn THAY seller (đơn vào trạng thái chờ đẩy như seller tự đặt)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CustomerStagingOrderResDto })
  async placeFor(
    @Query() q: AdminPlaceOrderForDto,
    @Body() dto: PlaceCustomerOrderDto,
  ): Promise<CustomerStagingOrderResDto> {
    return this.customerOrderService.placeOrder(await this.target(q.customerId), dto);
  }

  @Post('push')
  @Auth([RoleType.Admin])
  @ApiOperation({ summary: 'Ops đẩy đơn chờ của seller vào sản xuất' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PushCustomerOrdersResDto })
  async pushFor(
    @Query() q: AdminPlaceOrderForDto,
    @Body() dto: PushCustomerOrdersDto,
  ): Promise<PushCustomerOrdersResDto> {
    return this.customerOrderService.pushToProduction(await this.target(q.customerId), dto);
  }

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
