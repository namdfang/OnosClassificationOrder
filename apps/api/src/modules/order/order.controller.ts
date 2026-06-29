import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  ApplyCuttingFilesDto,
  ApplyCuttingFilesResDto,
  BulkAssignDesignerDto,
  BulkAssignDesignerPreviewDto,
  BulkAssignDesignerPreviewResDto,
  BulkAssignDesignerResDto,
  BulkAssignOrderDto,
  BulkAssignOrderResDto,
  BulkTransferOrderDto,
  BulkUpdateOrderFieldDto,
  BulkUpdateOrderFieldResDto,
  DesignerBreakdownResDto,
  GetErrorLogDto,
  GetErrorLogResDto,
  GetOrderByProductionIdResDto,
  SetProductionErrorDto,
  SetProductionErrorResDto,
  GetFactoryOverviewDto,
  GetFactoryOverviewResDto,
  GetLifecycleOverviewDto,
  GetLifecycleOverviewResDto,
  GetGroupedProductionOrdersResDto,
  FulfillmentStatusCountsResDto,
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
  ImportReworkOrdersDto,
  ImportReworkOrdersResDto,
  PreviewCuttingFilesDto,
  PreviewCuttingFilesResDto,
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
  RoleType.DesignerLeader,
  RoleType.Designer,
  RoleType.Fulfillment,
];

const ORDER_WRITE_ROLES = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.Support,
  RoleType.DesignerLeader,
  RoleType.Fulfillment,
];

/**
 * Role gate cho các endpoint edit field (route-level). Whitelist rộng — service
 * sẽ check tiếp field-by-field qua `assertCanEditField()` (ưu tiên
 * `role.permissionCodes`, fallback `FIELD_EDIT_ROLES` map). Tức là Support
 * vào được endpoint nhưng chỉ edit được field nào có `order.field.<X>.edit`
 * trong `role.permissionCodes` (Admin enable qua UI Roles).
 */
const ORDER_FIELD_EDIT_ROLES = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.DesignerLeader,
  RoleType.Designer,
  RoleType.Fulfillment,
  RoleType.Support,
  RoleType.SupportManager,
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
    return this.orderService.getOrders(dto, user?.role?.name, user?._id ? String(user._id) : undefined, user?.factoryId, user?.fulfillmentStage);
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
    return this.orderService.getDashboard(dto, user?.role?.name, user?.fulfillmentStage, user?.factoryId);
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
    return this.orderService.getStatusOverview(dto, user?.role?.name, user?._id ? String(user._id) : undefined, user?.factoryId, user?.fulfillmentStage);
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
    return this.orderService.getOrdersGroupedByType(dto, user?.role?.name, user?._id ? String(user._id) : undefined, user?.factoryId, user?.fulfillmentStage);
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
    return this.orderService.getWorkshopAvailableFilters(dto, user?.role?.name, user?._id ? String(user._id) : undefined, user?.factoryId, user?.fulfillmentStage);
  }

  @Get('fulfillment-status-counts')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({ summary: 'Đếm đơn theo 5 trạng thái stage Fulfillment (bảng trang In)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: FulfillmentStatusCountsResDto })
  async getFulfillmentStatusCounts(
    @Query() dto: GetProductionOrdersDto,
    @AuthUser() user: UserDocument,
  ): Promise<FulfillmentStatusCountsResDto> {
    return this.orderService.getFulfillmentStatusCounts(dto, user?.role?.name, user?._id ? String(user._id) : undefined, user?.factoryId, user?.fulfillmentStage);
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

  @Post('check-pending')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({
    summary: 'Poll subset of orders for designsStatus updates (R2 pipeline)',
  })
  @HttpCode(HttpStatus.OK)
  async checkPendingDesigns(
    @Body() body: { ids?: string[] },
  ): Promise<{ success: true; data: Array<{ _id: string; designs?: Record<string, string>; designsStatus?: Record<string, string> }> }> {
    const result = await this.orderService.checkPendingDesigns(body?.ids || []);
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
    return this.orderService.exportOrders(dto, user?.role?.name, user?._id ? String(user._id) : undefined, user?.factoryId);
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
    return this.orderService.getFactoryOverview(dto, user?.role?.name, user?.factoryId, user?.fulfillmentStage);
  }

  @Get('lifecycle-overview')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Vòng đời đơn — phễu 9 chặng (soát tool → thiết kế → 7 stage fulfillment). Chỉ Admin.' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetLifecycleOverviewResDto })
  async getLifecycleOverview(
    @Query() dto: GetLifecycleOverviewDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetLifecycleOverviewResDto> {
    return this.orderService.getLifecycleOverview(dto, user?.role?.name, user?.factoryId);
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

  @Patch('bulk-assign')
  @Auth(ORDER_WRITE_ROLES)
  @ApiOperation({
    summary: 'Initial-assign factory + optional setup fields cho đơn UNMAPPED',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BulkAssignOrderResDto })
  async bulkAssignOrders(
    @Body() dto: BulkAssignOrderDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<BulkAssignOrderResDto> {
    return this.orderService.bulkAssignOrders(dto, { user, ip, userAgent });
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

  @Post('import-rework')
  @Auth(ORDER_WRITE_ROLES)
  @ApiOperation({ summary: 'Import file soát — UPDATE đơn hiện có theo productionId' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ImportReworkOrdersResDto })
  async importRework(
    @Body() dto: ImportReworkOrdersDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<ImportReworkOrdersResDto> {
    return this.orderService.importRework(dto, { user, ip, userAgent });
  }

  // ─── Cutting File Mapping (post-import) ──────────────────────────
  // Permission: Support + Admin + Manager (theo confirm với user — gọn hơn
  // ORDER_WRITE_ROLES vì designer/fulfill không cần map file cutting).
  @Post('cutting-files/preview')
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager, RoleType.Support])
  @ApiOperation({ summary: 'Preview cutting-file mapping — fetch tên file từ Drive + match đơn' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PreviewCuttingFilesResDto })
  async previewCuttingFiles(
    @Body() dto: PreviewCuttingFilesDto,
    @AuthUser() _user: UserDocument,
  ): Promise<PreviewCuttingFilesResDto> {
    return this.orderService.previewCuttingFiles(dto);
  }

  @Post('cutting-files/apply')
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager, RoleType.Support])
  @ApiOperation({ summary: 'Apply cutting-file mappings (bulk write + audit log)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ApplyCuttingFilesResDto })
  async applyCuttingFiles(
    @Body() dto: ApplyCuttingFilesDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<ApplyCuttingFilesResDto> {
    return this.orderService.applyCuttingFiles(dto, { user, ip, userAgent });
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
    return this.orderService.bulkUpdateField(
      dto,
      user?.role?.name,
      { user, ip, userAgent },
      user?.role?.permissionCodes,
    );
  }

  @Get('designer-breakdown')
  @Auth([RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager, RoleType.DesignerLeader])
  @ApiOperation({
    summary:
      'Designer KPI + matrix per-user theo filter hiện tại + overall baseline. Cho Admin/Leader.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DesignerBreakdownResDto })
  async getDesignerBreakdown(
    @Query() dto: GetProductionOrdersDto,
    @AuthUser() user: UserDocument,
  ): Promise<DesignerBreakdownResDto> {
    return this.orderService.getDesignerBreakdown(dto, user?.role?.name, user?.factoryId);
  }

  @Get('error-log')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({
    summary:
      'Nhật ký bù lỗi — đơn đang lỗi xưởng, sort theo thời gian lỗi cũ nhất; áp dụng visibility theo role.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetErrorLogResDto })
  async getErrorLog(
    @Query() dto: GetErrorLogDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetErrorLogResDto> {
    return this.orderService.getErrorLog(
      dto,
      user?.role?.name,
      user?._id ? String(user._id) : undefined,
      user?.factoryId,
    );
  }

  @Post('bulk-assign-designer-preview')
  @Auth([
    RoleType.SuperAdmin,
    RoleType.Admin,
    RoleType.Manager,
    RoleType.DesignerLeader,
  ])
  @ApiOperation({
    summary:
      'Pre-flight preview cho bulk assign designer — count theo status hiện tại + ai đang ôm task.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BulkAssignDesignerPreviewResDto })
  async bulkAssignDesignerPreview(
    @Body() dto: BulkAssignDesignerPreviewDto,
  ): Promise<BulkAssignDesignerPreviewResDto> {
    return this.orderService.bulkAssignDesignerPreview(dto);
  }

  @Post('bulk-assign-designer')
  @Auth([
    RoleType.SuperAdmin,
    RoleType.Admin,
    RoleType.Manager,
    RoleType.DesignerLeader,
  ])
  @ApiOperation({
    summary:
      'Bulk assign 1 designer cho N đơn. Skip đơn đang in-progress/done/rework + trả skipped list. Set reassignOthers=true để override đơn đã gán cho người khác.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BulkAssignDesignerResDto })
  async bulkAssignDesigner(
    @Body() dto: BulkAssignDesignerDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<BulkAssignDesignerResDto> {
    return this.orderService.bulkAssignDesigner(
      dto,
      user?.role?.name,
      { user, ip, userAgent },
      user?.role?.permissionCodes,
    );
  }

  @Post(':id/set-production-error')
  @Auth(ORDER_FIELD_EDIT_ROLES)
  @ApiOperation({
    summary:
      'Atomic set productionError + source + note. Code="other" bắt buộc source + note (BE validate).',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SetProductionErrorResDto })
  async setProductionError(
    @Param('id') id: string,
    @Body() dto: SetProductionErrorDto,
    @AuthUser() user: UserDocument,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
  ): Promise<SetProductionErrorResDto> {
    return this.orderService.setProductionError(
      id,
      dto,
      user?.role?.name,
      { user, ip, userAgent },
      user?.role?.permissionCodes,
    );
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
    return this.orderService.updateField(
      id,
      dto,
      user?.role?.name,
      { user, ip, userAgent },
      user?.role?.permissionCodes,
    );
  }

  @Get(':id/logs')
  @Auth(ORDER_LOG_VIEW_ROLES)
  @ApiOperation({ summary: 'List audit log entries for an order (Phase 3)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetOrderLogsResDto })
  async getLogs(@Param('id') id: string, @Query() dto: GetOrderLogsDto): Promise<GetOrderLogsResDto> {
    return this.orderService.getLogs(id, dto);
  }

  @Get('by-production-id/:code')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({
    summary: 'Lookup đơn theo productionId (workshop quét barcode USB) — exact match case-insensitive.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetOrderByProductionIdResDto })
  async getByProductionId(
    @Param('code') code: string,
    @AuthUser() user: UserDocument,
  ): Promise<GetOrderByProductionIdResDto> {
    return this.orderService.getByProductionId(
      code,
      user?.role?.name,
      user?._id ? String(user._id) : undefined,
      user?.factoryId,
    ) as Promise<GetOrderByProductionIdResDto>;
  }

  @Get(':id')
  @Auth(ORDER_VIEW_ROLES)
  @ApiOperation({ summary: 'Get single order — full info cho detail dialog.' })
  @HttpCode(HttpStatus.OK)
  async getOrderById(
    @Param('id') id: string,
    @AuthUser() user: UserDocument,
  ): Promise<{ success: true; data: unknown }> {
    return this.orderService.getOrderById(id, user?.role?.name, user?._id ? String(user._id) : undefined, user?.factoryId);
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

  @Post('backfill-designer-status')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({
    summary:
      'Infer designerStatus + timestamps for legacy orders from assignee + toolResultNote + OrderLog (idempotent).',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async backfillDesignerStatus(): Promise<ResDto> {
    const result = await this.orderService.backfillDesignerStatus();
    return { success: true, data: result };
  }
}
