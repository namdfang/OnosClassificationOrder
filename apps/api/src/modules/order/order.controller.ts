import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  BulkTransferOrderDto,
  BulkUpdateOrderFieldDto,
  BulkUpdateOrderFieldResDto,
  GetFactoryOverviewDto,
  GetFactoryOverviewResDto,
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
  TransferOrderDto,
  TransferOrderResDto,
  UpdateOrderFieldDto,
  UpdateOrderFieldResDto,
  WorkshopAvailableFiltersResDto,
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
  async getDashboard(
    @Query() dto: GetOrderDashboardDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetOrderDashboardResDto> {
    return this.orderService.getDashboard(dto, user?.role?.name);
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

  @Get('workshop-filters')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({
    summary: 'Aggregate workshop dropdown options + count theo cross-facet pattern',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: WorkshopAvailableFiltersResDto })
  async getWorkshopFilters(
    @Query() dto: GetProductionOrdersDto,
    @AuthUser() user: UserDocument,
  ): Promise<WorkshopAvailableFiltersResDto> {
    return this.orderService.getWorkshopAvailableFilters(dto, user?.role?.name);
  }

  @Get('import-summary')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({ summary: "Aggregate today's imported orders by (type, size, fabric)" })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetImportSummaryResDto })
  async getImportSummary(@Query() dto: GetImportSummaryDto): Promise<GetImportSummaryResDto> {
    return this.orderService.getImportSummary(dto);
  }

  @Post('backfill-fabric')
  @Auth(ORDER_WRITE_ROLES)
  @ApiOperation({
    summary: 'Re-derive order.fabricType from productConfig — for orders missing fabric',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async backfillOrderFabric(): Promise<{ success: true; data: { scanned: number; updated: number } }> {
    const result = await this.orderService.backfillOrderFabric();
    return { success: true, data: result };
  }

  @Get('export')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({ summary: 'Return ALL orders matching filter (no pagination) for spreadsheet export' })
  @HttpCode(HttpStatus.OK)
  async exportOrders(
    @Query() dto: GetProductionOrdersDto,
    @AuthUser() user: UserDocument,
  ) {
    return this.orderService.exportOrders(dto, user?.role?.name);
  }

  @Get('factory-overview')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({ summary: 'Factory transfer dashboard — totals + flow matrix' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetFactoryOverviewResDto })
  async getFactoryOverview(
    @Query() dto: GetFactoryOverviewDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetFactoryOverviewResDto> {
    return this.orderService.getFactoryOverview(dto, user?.role?.name);
  }

  @Patch('bulk-transfer')
  @Auth(ORDER_WRITE_ROLES)
  @ApiOperation({ summary: 'Transfer multiple orders to another factory' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TransferOrderResDto })
  async bulkTransferOrders(
    @Body() dto: BulkTransferOrderDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<TransferOrderResDto> {
    return this.orderService.bulkTransferOrders(dto, { user, ip, userAgent });
  }

  @Patch(':id/transfer')
  @Auth(ORDER_WRITE_ROLES)
  @ApiOperation({ summary: 'Transfer a single order to another factory' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TransferOrderResDto })
  async transferOrder(
    @Param('id') id: string,
    @Body() dto: TransferOrderDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<TransferOrderResDto> {
    return this.orderService.transferOrder(id, dto, { user, ip, userAgent });
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
