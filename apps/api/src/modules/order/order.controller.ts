import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  BulkUpdateOrderFieldDto,
  BulkUpdateOrderFieldResDto,
  GetGroupedProductionOrdersResDto,
  GetImportSummaryDto,
  GetImportSummaryResDto,
  GetOrderDashboardDto,
  GetOrderDashboardResDto,
  GetOrderLogsDto,
  GetOrderLogsResDto,
  GetOrderStatusOverviewDto,
  GetOrderStatusOverviewResDto,
  GetProductionOrdersDto,
  GetProductionOrdersResDto,
  ImportProductionOrdersDto,
  ImportProductionOrdersResDto,
  ResDto,
  RoleType,
  UpdateOrderFieldDto,
  UpdateOrderFieldResDto,
} from 'shared';

import { Auth, ClientIp, UserAgent } from '@/decorators';

import type { UserDocument } from '../user/user.entity';
import { OrderService } from './order.service';

const ORDER_VIEW_ROLES = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.Support,
  RoleType.Designer,
  RoleType.Fulfillment,
];

const ORDER_WRITE_ROLES = [RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager, RoleType.Support];

const ORDER_FIELD_EDIT_ROLES = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.Designer,
  RoleType.Fulfillment,
];

const ORDER_LOG_VIEW_ROLES = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.Support,
];

@Controller('orders')
@ApiTags('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({ summary: 'List production orders' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetProductionOrdersResDto })
  async getOrders(
    @Query() dto: GetProductionOrdersDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetProductionOrdersResDto> {
    return this.orderService.getOrders(dto, user?.role?.name);
  }

  @Get('dashboard')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({ summary: 'Order dashboard with per-type breakdown' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetOrderDashboardResDto })
  async getDashboard(@Query() dto: GetOrderDashboardDto): Promise<GetOrderDashboardResDto> {
    return this.orderService.getDashboard(dto);
  }

  @Get('status-overview')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({ summary: 'Status counts + per-field breakdown for dashboard tab B' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetOrderStatusOverviewResDto })
  async getStatusOverview(
    @Query() dto: GetOrderStatusOverviewDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetOrderStatusOverviewResDto> {
    return this.orderService.getStatusOverview(dto, user?.role?.name);
  }

  @Get('grouped')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({
    summary: 'List orders grouped by product type — pagination unit = product (no row split)',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetGroupedProductionOrdersResDto })
  async getOrdersGrouped(
    @Query() dto: GetProductionOrdersDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetGroupedProductionOrdersResDto> {
    return this.orderService.getOrdersGroupedByType(dto, user?.role?.name);
  }

  @Get('import-summary')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({ summary: "Aggregate today's imported orders by (type, size, fabric)" })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetImportSummaryResDto })
  async getImportSummary(@Query() dto: GetImportSummaryDto): Promise<GetImportSummaryResDto> {
    return this.orderService.getImportSummary(dto);
  }

  @Post('import')
  @Auth(ORDER_WRITE_ROLES)
  @ApiOperation({ summary: 'Bulk import production orders' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ImportProductionOrdersResDto })
  async importOrders(
    @Body() dto: ImportProductionOrdersDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<ImportProductionOrdersResDto> {
    return this.orderService.importOrders(dto, { user, ip, userAgent });
  }

  @Patch('bulk-field')
  @Auth(ORDER_FIELD_EDIT_ROLES)
  @ApiOperation({ summary: 'Bulk update a workshop field on multiple orders' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BulkUpdateOrderFieldResDto })
  async bulkUpdateField(
    @Body() dto: BulkUpdateOrderFieldDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<BulkUpdateOrderFieldResDto> {
    return this.orderService.bulkUpdateField(dto, user?.role?.name, { user, ip, userAgent });
  }

  @Patch(':id/field')
  @Auth(ORDER_FIELD_EDIT_ROLES)
  @ApiOperation({ summary: 'Inline update a single workshop field' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateOrderFieldResDto })
  async updateField(
    @Param('id') id: string,
    @Body() dto: UpdateOrderFieldDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<UpdateOrderFieldResDto> {
    return this.orderService.updateField(id, dto, user?.role?.name, { user, ip, userAgent });
  }

  @Get(':id/logs')
  @Auth(ORDER_LOG_VIEW_ROLES)
  @ApiOperation({ summary: 'List audit log entries for an order (Phase 3)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetOrderLogsResDto })
  async getLogs(@Param('id') id: string, @Query() dto: GetOrderLogsDto): Promise<GetOrderLogsResDto> {
    return this.orderService.getLogs(id, dto);
  }

  @Delete(':id')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Delete order (soft)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async deleteOrder(
    @Param('id') id: string,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<ResDto> {
    await this.orderService.deleteOrder(id, { user, ip, userAgent });
    return { success: true };
  }

  @Post('refresh-image-urls')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({
    summary: 'Re-apply transformDriveUrl to all existing orders (for fixing stale URLs)',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async refreshImageUrls(): Promise<ResDto> {
    const result = await this.orderService.refreshImageUrls();
    return { success: true, data: result };
  }
}
