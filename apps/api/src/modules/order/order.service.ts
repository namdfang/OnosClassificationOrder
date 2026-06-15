import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  BulkUpdateOrderFieldDto,
  BulkUpdateOrderFieldResDto,
  BreakdownBucket,
  DesignFields,
  FactoryBreakdown,
  FactoryBucket,
  GetGroupedProductionOrdersResDto,
  GetImportSummaryDto,
  GetImportSummaryResDto,
  GetOrderDashboardDto,
  GetOrderDashboardResDto,
  GetOrderStatusOverviewDto,
  GetOrderStatusOverviewResDto,
  GetProductionOrdersDto,
  GetProductionOrdersResDto,
  ImportProductionOrderRow,
  ImportProductionOrdersDto,
  ImportProductionOrdersResDto,
  ImportSummaryGroup,
  MachineBucket,
  MachineKpi,
  MachineTypeBreakdown,
  MockupSummary,
  OrderStatusOverview,
  OrderWorkshopField,
  SizeSummary,
  TypeSummary,
  UpdateOrderFieldDto,
  UpdateOrderFieldResDto,
  UserBreakdown,
} from 'shared';
import { RoleType, WorkshopConfigCategory } from 'shared';
import { Logger } from 'winston';

import { canonicalDriveUrl, processImageUrl, transformDriveUrl } from '@/utils/transform-drive-url';

import { OrderLogService } from '../order-log/order-log.service';
import type { AuditContext } from '../order-log/order-log.service';
import { ProductConfigRepository } from '../product-config/product-config.repository';
import { RedisCacheService } from '../redis-cache/redis-cache.service';
import { WorkshopConfigRepository } from '../workshop-config/workshop-config.repository';
import { OrderEntity, OrderDocument } from './order.entity';
import { OrderRepository } from './order.repository';

const FIELD_CONFIG_CATEGORY: Record<OrderWorkshopField, WorkshopConfigCategory | null> = {
  printStatus: WorkshopConfigCategory.PrintStatus,
  printStatusNote: WorkshopConfigCategory.PrintStatusNote,
  toolResult: WorkshopConfigCategory.ToolResult,
  toolResultNote: WorkshopConfigCategory.ToolResultNote,
  errorFile: WorkshopConfigCategory.ErrorFileType,
  errorFileNote: null, // free text
  assignee: WorkshopConfigCategory.Assignee,
  assigneeNote: WorkshopConfigCategory.AssigneeNote,
  fabricType: WorkshopConfigCategory.FabricType,
};

const ADMIN_ROLES: RoleType[] = [RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager];

const FIELD_EDIT_ROLES: Record<OrderWorkshopField, RoleType[]> = {
  printStatus: [...ADMIN_ROLES, RoleType.Fulfillment],
  printStatusNote: [...ADMIN_ROLES, RoleType.Fulfillment],
  toolResult: [...ADMIN_ROLES, RoleType.Designer],
  toolResultNote: [...ADMIN_ROLES, RoleType.Designer],
  errorFile: [...ADMIN_ROLES, RoleType.Designer],
  errorFileNote: [...ADMIN_ROLES, RoleType.Designer],
  assignee: [...ADMIN_ROLES, RoleType.Designer],
  assigneeNote: [...ADMIN_ROLES, RoleType.Designer],
  // Fabric is admin-managed (it's a product attribute, not a workshop status).
  fabricType: ADMIN_ROLES,
};

const READY_FOR_FULFILL_CODE = 'ok';

const ORDER_LIST_CACHE_PREFIX = 'orders:list:';
const ORDER_LIST_CACHE_TTL_SECONDS = 60;

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly productConfigRepository: ProductConfigRepository,
    private readonly workshopConfigRepository: WorkshopConfigRepository,
    private readonly orderLogService: OrderLogService,
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderDocument>,
    @Inject('winston') private readonly logger: Logger,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  /**
   * Per-role visibility filter, applied on top of any client-side query filters.
   *
   *  - Admin / Manager / Support → no restriction (date range optional)
   *  - Designer                  → defaults to last 7 days, override via createdFrom/createdTo
   *  - Fulfillment               → defaults to last 7 days + readyForFulfill, can override date
   *
   * `readyForFulfill` is ALWAYS enforced for Fulfillment regardless of query.
   */
  private buildVisibilityFilter(roleName?: RoleType, dto?: GetProductionOrdersDto): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const startOfWindow = new Date();
    startOfWindow.setDate(startOfWindow.getDate() - 6); // today + previous 6 = 7-day window
    startOfWindow.setHours(0, 0, 0, 0);

    const hasDateOverride = !!(dto?.createdFrom || dto?.createdTo);
    const buildRange = () => {
      const range: Record<string, Date> = {};
      if (dto?.createdFrom) range.$gte = new Date(dto.createdFrom);
      if (dto?.createdTo) {
        const end = new Date(dto.createdTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      return range;
    };

    if (roleName === RoleType.Designer) {
      filter.createdAt = hasDateOverride ? buildRange() : { $gte: startOfWindow, $lte: endOfToday };
    } else if (roleName === RoleType.Fulfillment) {
      filter.createdAt = hasDateOverride ? buildRange() : { $gte: startOfWindow, $lte: endOfToday };
      filter.readyForFulfill = true;
    } else if (hasDateOverride) {
      const range: Record<string, Date> = {};
      if (dto?.createdFrom) range.$gte = new Date(dto.createdFrom);
      if (dto?.createdTo) {
        const end = new Date(dto.createdTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      filter.createdAt = range;
    }

    return filter;
  }

  private assertCanEditField(field: OrderWorkshopField, roleName?: RoleType): void {
    const allowed = FIELD_EDIT_ROLES[field];
    if (!roleName || !allowed.includes(roleName)) {
      throw new ForbiddenException(`Role ${roleName ?? 'unknown'} cannot edit field "${field}"`);
    }
  }

  private async assertValueAllowed(field: OrderWorkshopField, value: string | null): Promise<void> {
    if (value === null || value === '') return;
    const category = FIELD_CONFIG_CATEGORY[field];
    if (!category) return; // free text field, no validation
    const found = await this.workshopConfigRepository.findOne({ category, code: value, isActive: true });
    if (!found) {
      throw new BadRequestException(`Invalid value "${value}" for field "${field}"`);
    }
  }

  private buildListCacheKey(dto: GetProductionOrdersDto, roleName?: RoleType): string {
    const norm = {
      page: dto.page,
      limit: dto.limit,
      sort: dto.sort,
      order: dto.order,
      search: dto.search,
      isMapped: dto.isMapped,
      factoryId: dto.factoryId,
      machineTypeId: dto.machineTypeId,
      status: dto.status,
      printStatus: dto.printStatus,
      toolResultNote: dto.toolResultNote,
      assignee: dto.assignee,
      errorFile: dto.errorFile,
      createdFrom: dto.createdFrom,
      createdTo: dto.createdTo,
      role: roleName ?? '',
    };
    return ORDER_LIST_CACHE_PREFIX + Buffer.from(JSON.stringify(norm)).toString('base64');
  }

  private async invalidateListCache(): Promise<void> {
    try {
      const keys = await this.redisCacheService.findKeysByPrefix(ORDER_LIST_CACHE_PREFIX);
      if (keys.length === 0) return;
      await Promise.all(keys.map((k) => this.redisCacheService.deleteKey(k)));
      // eslint-disable-next-line no-console
      console.log(`[cache] invalidated ${keys.length} order list keys`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[cache] invalidate failed:', error);
    }
  }

  /** Compose the Mongo filter for getOrders + getOrdersGroupedByType. */
  private buildOrderListFilter(
    dto: GetProductionOrdersDto,
    roleName?: RoleType,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = this.buildVisibilityFilter(roleName, dto);
    if (dto.search) {
      filter.$or = [
        { productionId: { $regex: dto.search, $options: 'i' } },
        { userSku: { $regex: dto.search, $options: 'i' } },
        { userEmail: { $regex: dto.search, $options: 'i' } },
        { orderId: { $regex: dto.search, $options: 'i' } },
        { type: { $regex: dto.search, $options: 'i' } },
      ];
    }
    if (typeof dto.isMapped === 'boolean') filter.isMapped = dto.isMapped;
    if (dto.factoryId) filter.factoryId = dto.factoryId;
    if (dto.machineTypeId) filter.machineTypeId = dto.machineTypeId;
    if (dto.status) filter.status = dto.status;
    if (dto.printStatus) filter.printStatus = { $in: dto.printStatus.split(',').filter(Boolean) };
    if (dto.toolResultNote)
      filter.toolResultNote = { $in: dto.toolResultNote.split(',').filter(Boolean) };
    if (dto.assignee) filter.assignee = { $in: dto.assignee.split(',').filter(Boolean) };
    if (dto.errorFile) filter.errorFile = { $in: dto.errorFile.split(',').filter(Boolean) };
    return filter;
  }

  async getOrders(dto: GetProductionOrdersDto, roleName?: RoleType): Promise<GetProductionOrdersResDto> {
    // [cache disabled] Re-enable by uncommenting the block below + the cache
    // write at the end of this method.
    // const cacheKey = this.buildListCacheKey(dto, roleName);
    // const t0 = Date.now();
    // try {
    //   const cached = await this.redisCacheService.getKey(cacheKey);
    //   if (cached) return JSON.parse(cached);
    // } catch { /* fall through */ }
    void roleName; // keep the var read so we can re-enable the cache key later

    const { page, limit, sort, order } = dto;
    const filter = this.buildOrderListFilter(dto, roleName);

    // Special sort mode `grouped` — keep orders of the same product clustered
    // (type → size → fabric, newest first within tie) so the workshop table
    // mirrors the "Tổng hợp đơn theo ngày" view.
    const sortSpec: Record<string, 1 | -1> =
      sort === 'grouped'
        ? { type: 1, size: 1, fabricType: 1, createdAt: -1 }
        : { [sort || 'createdAt']: order === 'asc' ? 1 : -1 };

    const { data, total } = await this.orderRepository.findAllAndCount(filter, {
      paging: { skip: limit * (page - 1), limit },
      sort: sortSpec,
      populate: [
        { path: 'factory', select: ['name', 'shortName'] },
        { path: 'machineType', select: ['name', 'shortName'] },
      ],
    });

    const result = { success: true as const, data, total };

    // [cache disabled]
    // void this.redisCacheService
    //   .setKey(cacheKey, JSON.stringify(result), ORDER_LIST_CACHE_TTL_SECONDS)
    //   .catch(() => undefined);

    return result;
  }

  /**
   * Same filters as getOrders, but paginates by **product type** instead of
   * by row. Each page returns N product groups with ALL their orders — this
   * way client-side aggregation (×N duplicate badges, "heaviest combo"
   * highlight) is always correct, never split across pages.
   *
   * Groups are sorted by `totalOrders` desc so the busiest products surface
   * first. Pagination `total` = number of distinct product types matching
   * the filter.
   */
  async getOrdersGroupedByType(
    dto: GetProductionOrdersDto,
    roleName?: RoleType,
  ): Promise<GetGroupedProductionOrdersResDto> {
    const { page, limit } = dto;
    const filter = this.buildOrderListFilter(dto, roleName);

    // 1) Count distinct types matching the filter (for pagination total).
    const totalAgg = await this.orderModel.aggregate([
      { $match: filter },
      { $group: { _id: { $ifNull: ['$type', ''] } } },
      { $count: 'n' },
    ]);
    const totalTypes: number = totalAgg[0]?.n || 0;

    // 2) Aggregate per-type counts, sort by orderCount desc, paginate by type.
    const typeAgg: Array<{ _id: string; totalOrders: number; totalQuantity: number }> =
      await this.orderModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $ifNull: ['$type', ''] },
            totalOrders: { $sum: 1 },
            totalQuantity: { $sum: { $ifNull: ['$quantity', 1] } },
          },
        },
        // Tiebreak by type name asc so the ordering is stable across reloads.
        { $sort: { totalOrders: -1, _id: 1 } },
        { $skip: limit * (page - 1) },
        { $limit: limit },
      ]);

    if (typeAgg.length === 0) {
      return { success: true, data: [], total: totalTypes };
    }

    // 3) Fetch every order belonging to the selected types in one query.
    // We translate empty-string type → match {type: null OR undefined}.
    const concreteTypes = typeAgg.map((t) => t._id).filter(Boolean);
    const hasUnnamed = typeAgg.some((t) => !t._id);
    const typeFilter: Record<string, unknown>[] = [];
    if (concreteTypes.length > 0) typeFilter.push({ type: { $in: concreteTypes } });
    if (hasUnnamed) typeFilter.push({ type: { $in: [null, ''] } });

    const orders = await this.orderRepository.findAll(
      { ...filter, $or: typeFilter },
      {
        sort: { type: 1, size: 1, fabricType: 1, createdAt: -1 },
        populate: [
          { path: 'factory', select: ['name', 'shortName'] },
          { path: 'machineType', select: ['name', 'shortName'] },
        ],
      },
    );

    // 4) Re-attach orders to their groups in the (count-desc) order.
    const byType = new Map<string, unknown[]>();
    for (const o of orders as unknown as Array<{ type?: string }>) {
      const k = o.type || '';
      const bucket = byType.get(k) || [];
      bucket.push(o);
      byType.set(k, bucket);
    }

    const data = typeAgg.map((t) => ({
      type: t._id,
      totalOrders: t.totalOrders,
      totalQuantity: t.totalQuantity,
      orders: (byType.get(t._id) || []) as never,
    }));

    return { success: true, data, total: totalTypes };
  }

  /**
   * Aggregate orders into a dashboard view:
   *   - totals (orders / qty / production / shipping / total cost)
   *   - per-type breakdown with size + mockup statistics
   *
   * Cost calculation uses `quantity` as multiplier:
   *   productionCost = sum(baseCost * quantity)
   *   shippingCost   = sum(shipCost * quantity)
   *
   * Mockups are bucketed by URL string — `count > 1` means duplicate (same
   * mockup image used across multiple orders).
   */
  async getDashboard(dto: GetOrderDashboardDto): Promise<GetOrderDashboardResDto> {
    // [cache disabled]
    // const cacheKey = `orders:dashboard:${Buffer.from(JSON.stringify(dto)).toString('base64')}`;
    // try {
    //   const cached = await this.redisCacheService.getKey(cacheKey);
    //   if (cached) return JSON.parse(cached);
    // } catch { /* fall through */ }

    const match: Record<string, unknown> = {};
    if (dto.startDate || dto.endDate) {
      const range: Record<string, Date> = {};
      if (dto.startDate) range.$gte = new Date(dto.startDate);
      if (dto.endDate) {
        const end = new Date(dto.endDate);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      match.orderAt = range;
    }

    if (dto.searchType?.trim()) {
      match.type = { $regex: escapeRegex(dto.searchType.trim()), $options: 'i' };
    }

    if (dto.searchUser?.trim()) {
      const s = escapeRegex(dto.searchUser.trim());
      match.$or = [
        { userSku: { $regex: s, $options: 'i' } },
        { userEmail: { $regex: s, $options: 'i' } },
      ];
    }

    const totalsAgg = await this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalQuantity: { $sum: { $ifNull: ['$quantity', 1] } },
          totalProductionCost: {
            $sum: { $multiply: [{ $ifNull: ['$baseCost', 0] }, { $ifNull: ['$quantity', 1] }] },
          },
          totalShippingCost: {
            $sum: { $multiply: [{ $ifNull: ['$shipCost', 0] }, { $ifNull: ['$quantity', 1] }] },
          },
        },
      },
    ]);

    const totals = totalsAgg[0]
      ? {
          totalOrders: totalsAgg[0].totalOrders || 0,
          totalQuantity: totalsAgg[0].totalQuantity || 0,
          totalProductionCost: round2(totalsAgg[0].totalProductionCost),
          totalShippingCost: round2(totalsAgg[0].totalShippingCost),
          totalCost: round2((totalsAgg[0].totalProductionCost || 0) + (totalsAgg[0].totalShippingCost || 0)),
        }
      : { totalOrders: 0, totalQuantity: 0, totalProductionCost: 0, totalShippingCost: 0, totalCost: 0 };

    // Per-type aggregation: group, collect raw rows to post-process size/mockup
    const byTypeAgg = await this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$type', 'Không xác định'] },
          quantity: { $sum: { $ifNull: ['$quantity', 1] } },
          orderCount: { $sum: 1 },
          minCost: { $min: '$baseCost' },
          maxCost: { $max: '$baseCost' },
          productionCost: {
            $sum: { $multiply: [{ $ifNull: ['$baseCost', 0] }, { $ifNull: ['$quantity', 1] }] },
          },
          shippingCost: {
            $sum: { $multiply: [{ $ifNull: ['$shipCost', 0] }, { $ifNull: ['$quantity', 1] }] },
          },
          // Push minimal fields needed for post-processing
          rows: {
            $push: {
              size: '$size',
              quantity: { $ifNull: ['$quantity', 1] },
              mockupUrl: '$mockupUrl',
              mockupOriginalUrl: '$mockupOriginalUrl',
            },
          },
        },
      },
      { $sort: { quantity: -1 } },
    ]);

    const byType: TypeSummary[] = byTypeAgg.map((t) => {
      const sizeMap = new Map<string, number>();
      const mockupMap = new Map<string, MockupSummary>();

      for (const r of t.rows) {
        const qty = r.quantity || 1;
        const size = (r.size || '').trim() || '—';
        sizeMap.set(size, (sizeMap.get(size) || 0) + qty);

        if (r.mockupUrl) {
          const key = r.mockupUrl;
          const existing = mockupMap.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            mockupMap.set(key, {
              url: key,
              originalUrl: r.mockupOriginalUrl,
              count: 1,
            });
          }
        }
      }

      const sizes: SizeSummary[] = Array.from(sizeMap.entries())
        .map(([size, count]) => ({ size, count }))
        .sort((a, b) => compareSize(a.size, b.size));

      const mockups: MockupSummary[] = Array.from(mockupMap.values()).sort((a, b) => b.count - a.count);
      const duplicateMockups = mockups.filter((m) => m.count > 1);

      return {
        type: t._id || 'Không xác định',
        quantity: t.quantity || 0,
        minCost: round2(t.minCost || 0),
        maxCost: round2(t.maxCost || 0),
        productionCost: round2(t.productionCost),
        shippingCost: round2(t.shippingCost),
        totalCost: round2((t.productionCost || 0) + (t.shippingCost || 0)),
        uniqueMockupCount: mockups.length,
        duplicateMockupCount: duplicateMockups.length,
        sizes,
        mockups,
        duplicateMockups,
      };
    });

    // Factory breakdown with nested machine-type breakdown
    const byFactoryAgg = await this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { factoryId: '$factoryId', machineTypeId: '$machineTypeId' },
          quantity: { $sum: { $ifNull: ['$quantity', 1] } },
        },
      },
      {
        $lookup: {
          from: 'factories',
          localField: '_id.factoryId',
          foreignField: '_id',
          as: 'factory',
        },
      },
      {
        $lookup: {
          from: 'machineTypes',
          localField: '_id.machineTypeId',
          foreignField: '_id',
          as: 'machineType',
        },
      },
      {
        $project: {
          factoryId: '$_id.factoryId',
          machineTypeId: '$_id.machineTypeId',
          factoryName: { $arrayElemAt: ['$factory.name', 0] },
          factoryShortName: { $arrayElemAt: ['$factory.shortName', 0] },
          machineTypeName: { $arrayElemAt: ['$machineType.name', 0] },
          machineTypeShortName: { $arrayElemAt: ['$machineType.shortName', 0] },
          quantity: 1,
        },
      },
    ]);

    // Group flat (factory, machineType) tuples into nested structure
    const factoryMap = new Map<
      string,
      {
        factoryId?: string;
        factoryName: string;
        factoryShortName?: string;
        quantity: number;
        machineMap: Map<string, MachineTypeBreakdown>;
      }
    >();

    let totalFactoryQty = 0;
    for (const row of byFactoryAgg) {
      const fKey = (row.factoryId as string) || '__unmapped__';
      const fName = (row.factoryName as string) || 'Chưa xác định';
      const fShort = (row.factoryShortName as string) || undefined;

      let f = factoryMap.get(fKey);
      if (!f) {
        f = {
          factoryId: row.factoryId,
          factoryName: fName,
          factoryShortName: fShort,
          quantity: 0,
          machineMap: new Map(),
        };
        factoryMap.set(fKey, f);
      }
      f.quantity += row.quantity;
      totalFactoryQty += row.quantity;

      const mKey = (row.machineTypeId as string) || '__unmapped__';
      const mName = (row.machineTypeName as string) || 'Chưa xác định';
      const mShort = (row.machineTypeShortName as string) || undefined;

      const existingM = f.machineMap.get(mKey);
      if (existingM) {
        existingM.quantity += row.quantity;
      } else {
        f.machineMap.set(mKey, {
          machineTypeId: row.machineTypeId,
          machineTypeName: mName,
          machineTypeShortName: mShort,
          quantity: row.quantity,
          percentage: 0, // computed below
        });
      }
    }

    const byFactory: FactoryBreakdown[] = Array.from(factoryMap.values())
      .map((f) => {
        const machineList = Array.from(f.machineMap.values());
        const machineTotal = machineList.reduce((s, m) => s + m.quantity, 0);
        machineList.forEach((m) => {
          m.percentage = machineTotal > 0 ? round2((m.quantity / machineTotal) * 100) : 0;
        });
        machineList.sort((a, b) => b.quantity - a.quantity);

        return {
          factoryId: f.factoryId,
          factoryName: f.factoryName,
          factoryShortName: f.factoryShortName,
          quantity: f.quantity,
          percentage: totalFactoryQty > 0 ? round2((f.quantity / totalFactoryQty) * 100) : 0,
          byMachineType: machineList,
        };
      })
      .sort((a, b) => b.quantity - a.quantity);

    // User breakdown — grouped by userEmail (primary identifier), falling back
    // to userSku when email is missing. Sorted by orderCount desc.
    const byUserAgg = await this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$userEmail', '$userSku'] },
          userSku: { $first: '$userSku' },
          userEmail: { $first: '$userEmail' },
          orderCount: { $sum: 1 },
          totalQuantity: { $sum: { $ifNull: ['$quantity', 1] } },
          totalProductionCost: {
            $sum: { $multiply: [{ $ifNull: ['$baseCost', 0] }, { $ifNull: ['$quantity', 1] }] },
          },
          totalShippingCost: {
            $sum: { $multiply: [{ $ifNull: ['$shipCost', 0] }, { $ifNull: ['$quantity', 1] }] },
          },
        },
      },
      { $sort: { orderCount: -1 } },
    ]);

    const byUser: UserBreakdown[] = byUserAgg
      .filter((u) => u._id) // skip orders with neither email nor sku
      .map((u) => ({
        userSku: u.userSku || undefined,
        userEmail: u.userEmail || undefined,
        orderCount: u.orderCount,
        totalQuantity: u.totalQuantity,
        totalProductionCost: round2(u.totalProductionCost),
        totalShippingCost: round2(u.totalShippingCost),
        totalCost: round2((u.totalProductionCost || 0) + (u.totalShippingCost || 0)),
      }));

    const result: GetOrderDashboardResDto = {
      success: true,
      data: {
        totals,
        byType,
        byFactory,
        byUser,
        filter: {
          startDate: dto.startDate,
          endDate: dto.endDate,
          searchType: dto.searchType,
          searchUser: dto.searchUser,
        },
      },
    };

    // [cache disabled]
    // void this.redisCacheService.setKey(cacheKey, JSON.stringify(result), 60).catch(() => undefined);

    return result;
  }

  /**
   * Status dashboard overview — runs all 10 group aggregations in a single
   * $facet so we hit the DB once. Returns:
   *  - totals: 6 KPI numbers + per-machine printed/pending mini KPIs
   *  - breakdown: counts per code (incl. null bucket) for every workshop field
   *    + factory + machineType + readyForFulfill
   *
   * Names + colors/icons are resolved against the WorkshopConfig collection
   * after aggregation (the orderModel only stores codes).
   */
  async getStatusOverview(
    dto: GetOrderStatusOverviewDto,
    roleName?: RoleType,
  ): Promise<GetOrderStatusOverviewResDto> {
    // Build base match — same filters as list, including visibility rule.
    const baseMatch = this.buildVisibilityFilter(roleName, {
      createdFrom: dto.createdFrom,
      createdTo: dto.createdTo,
    } as GetProductionOrdersDto);

    if (dto.printStatus) baseMatch.printStatus = { $in: dto.printStatus.split(',').filter(Boolean) };
    if (dto.printStatusNote) baseMatch.printStatusNote = { $in: dto.printStatusNote.split(',').filter(Boolean) };
    if (dto.toolResult) baseMatch.toolResult = { $in: dto.toolResult.split(',').filter(Boolean) };
    if (dto.toolResultNote) baseMatch.toolResultNote = { $in: dto.toolResultNote.split(',').filter(Boolean) };
    if (dto.errorFile) baseMatch.errorFile = { $in: dto.errorFile.split(',').filter(Boolean) };
    if (dto.assignee) baseMatch.assignee = { $in: dto.assignee.split(',').filter(Boolean) };
    if (dto.assigneeNote) baseMatch.assigneeNote = { $in: dto.assigneeNote.split(',').filter(Boolean) };
    if (dto.factoryId) baseMatch.factoryId = dto.factoryId;
    if (dto.machineTypeId) baseMatch.machineTypeId = dto.machineTypeId;
    if (typeof dto.readyForFulfill === 'boolean') baseMatch.readyForFulfill = dto.readyForFulfill;
    if (dto.search) {
      baseMatch.$or = [
        { productionId: { $regex: dto.search, $options: 'i' } },
        { userSku: { $regex: dto.search, $options: 'i' } },
        { userEmail: { $regex: dto.search, $options: 'i' } },
        { orderId: { $regex: dto.search, $options: 'i' } },
        { type: { $regex: dto.search, $options: 'i' } },
      ];
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const groupByField = (field: string) => [
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $project: { _id: 0, code: '$_id', count: 1 } },
      { $sort: { count: -1 as const } },
    ];

    const PRINTED_MACHINE_CODES = ['machine-1', 'machine-2', 'machine-3', 'machine-4', 'machine-94'];

    const [agg] = await this.orderModel.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          total: [{ $count: 'n' }],
          today: [{ $match: { createdAt: { $gte: startOfToday } } }, { $count: 'n' }],
          pendingToolOk: [
            { $match: { $or: [{ toolResultNote: { $exists: false } }, { toolResultNote: { $ne: 'ok' } }] } },
            { $count: 'n' },
          ],
          ready: [{ $match: { readyForFulfill: true } }, { $count: 'n' }],
          done: [{ $match: { printStatus: { $in: PRINTED_MACHINE_CODES } } }, { $count: 'n' }],
          errors: [
            { $match: { $or: [{ toolResultNote: 'error' }, { errorFile: { $ne: null, $exists: true } }] } },
            { $count: 'n' },
          ],
          printStatus: groupByField('printStatus'),
          printStatusNote: groupByField('printStatusNote'),
          toolResult: groupByField('toolResult'),
          toolResultNote: groupByField('toolResultNote'),
          errorFile: groupByField('errorFile'),
          assignee: groupByField('assignee'),
          assigneeNote: groupByField('assigneeNote'),
          factory: groupByField('factoryId'),
          machineType: groupByField('machineTypeId'),
          readyBreakdown: [
            { $group: { _id: { $ifNull: ['$readyForFulfill', false] }, count: { $sum: 1 } } },
            { $project: { _id: 0, key: '$_id', count: 1 } },
          ],
        },
      },
    ]);

    // Resolve workshop_config codes → name + color/icon. One bulk fetch.
    const allConfigs = await this.workshopConfigRepository.findAll({}, { sort: { category: 1, order: 1 } });
    const configMap = new Map<string, { name: string; color?: string; icon?: string }>();
    for (const cfg of allConfigs as unknown as Array<{
      category: string;
      code: string;
      name: string;
      color?: string;
      icon?: string;
    }>) {
      configMap.set(`${cfg.category}|${cfg.code}`, { name: cfg.name, color: cfg.color, icon: cfg.icon });
    }
    const resolve = (category: WorkshopConfigCategory, code: string | null): BreakdownBucket => {
      if (!code) return { code: null, name: 'Chưa phân loại', count: 0 };
      const meta = configMap.get(`${category}|${code}`);
      return {
        code,
        name: meta?.name || code,
        count: 0,
        color: meta?.color,
        icon: meta?.icon,
      };
    };
    const mapBreakdown = (category: WorkshopConfigCategory, rows: Array<{ code: string | null; count: number }>) =>
      rows.map((r) => ({ ...resolve(category, r.code), count: r.count }));

    // Resolve factory + machineType names
    const factoryIds = (agg.factory as Array<{ code: string | null; count: number }>)
      .map((r) => r.code)
      .filter((c): c is string => !!c);
    const factories = factoryIds.length
      ? await (this.orderModel.db.collection('factories') as unknown as {
          find: (q: Record<string, unknown>) => { toArray: () => Promise<Array<{ _id: unknown; name: string }>> };
        })
          .find({ _id: { $in: factoryIds } })
          .toArray()
      : [];
    const factoryMap = new Map<string, string>(factories.map((f) => [String(f._id), f.name]));

    const machineIds = (agg.machineType as Array<{ code: string | null; count: number }>)
      .map((r) => r.code)
      .filter((c): c is string => !!c);
    const machineTypes = machineIds.length
      ? await (this.orderModel.db.collection('machineTypes') as unknown as {
          find: (q: Record<string, unknown>) => { toArray: () => Promise<Array<{ _id: unknown; name: string }>> };
        })
          .find({ _id: { $in: machineIds } })
          .toArray()
      : [];
    const machineMap = new Map<string, string>(machineTypes.map((m) => [String(m._id), m.name]));

    const factoryBreakdown: FactoryBucket[] = (agg.factory as Array<{ code: string | null; count: number }>).map(
      (r) => ({
        factoryId: r.code,
        name: r.code ? factoryMap.get(r.code) || r.code : 'Chưa xác định',
        count: r.count,
      }),
    );

    const machineBreakdown: MachineBucket[] = (
      agg.machineType as Array<{ code: string | null; count: number }>
    ).map((r) => ({
      machineTypeId: r.code,
      name: r.code ? machineMap.get(r.code) || r.code : 'Chưa xác định',
      count: r.count,
    }));

    // Per-machine printed/pending KPI for Fulfill role
    const byMachine: MachineKpi[] = PRINTED_MACHINE_CODES.map((code) => {
      const meta = configMap.get(`print_status|${code}`);
      const printed = (agg.printStatus as Array<{ code: string | null; count: number }>).find((r) => r.code === code)?.count || 0;
      return {
        machineCode: code,
        machineName: meta?.name || code,
        printed,
        pending: 0,
      };
    });

    const totals: OrderStatusOverview['totals'] = {
      total: agg.total[0]?.n || 0,
      today: agg.today[0]?.n || 0,
      pendingToolOk: agg.pendingToolOk[0]?.n || 0,
      readyForFulfill: agg.ready[0]?.n || 0,
      done: agg.done[0]?.n || 0,
      errors: agg.errors[0]?.n || 0,
      byMachine,
    };

    const breakdown: OrderStatusOverview['breakdown'] = {
      printStatus: mapBreakdown(WorkshopConfigCategory.PrintStatus, agg.printStatus),
      printStatusNote: mapBreakdown(WorkshopConfigCategory.PrintStatusNote, agg.printStatusNote),
      toolResult: mapBreakdown(WorkshopConfigCategory.ToolResult, agg.toolResult),
      toolResultNote: mapBreakdown(WorkshopConfigCategory.ToolResultNote, agg.toolResultNote),
      errorFile: mapBreakdown(WorkshopConfigCategory.ErrorFileType, agg.errorFile),
      assignee: mapBreakdown(WorkshopConfigCategory.Assignee, agg.assignee),
      assigneeNote: mapBreakdown(WorkshopConfigCategory.AssigneeNote, agg.assigneeNote),
      factory: factoryBreakdown,
      machineType: machineBreakdown,
      readyForFulfill: (agg.readyBreakdown as Array<{ key: boolean; count: number }>).map((r) => ({
        key: !!r.key,
        count: r.count,
      })),
    };

    return {
      success: true,
      data: { totals, breakdown, filter: dto },
    };
  }

  /**
   * Aggregate every order created on a given day (across all imports) into
   * (type, size, fabricType) groups. Workshop scans these to print the same
   * blank batch together. Sorted by `orderCount` desc → most duplicated combo
   * first; ties broken by type, size, fabric for stable rendering.
   */
  async getImportSummary(dto: GetImportSummaryDto): Promise<GetImportSummaryResDto> {
    const dayStart = new Date(dto.date || new Date().toISOString().slice(0, 10));
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const rows = await this.orderModel.aggregate([
      { $match: { createdAt: { $gte: dayStart, $lte: dayEnd } } },
      {
        $group: {
          _id: {
            type: { $ifNull: ['$type', ''] },
            size: { $ifNull: ['$size', ''] },
            fabricType: { $ifNull: ['$fabricType', ''] },
          },
          totalQuantity: { $sum: { $ifNull: ['$quantity', 1] } },
          orderCount: { $sum: 1 },
          sampleProductionIds: { $push: '$productionId' },
        },
      },
      {
        $project: {
          _id: 0,
          type: '$_id.type',
          size: '$_id.size',
          fabricType: '$_id.fabricType',
          totalQuantity: 1,
          orderCount: 1,
          // Cap sample list at 5 to keep payload small.
          sampleProductionIds: { $slice: ['$sampleProductionIds', 5] },
        },
      },
      // Primary sort by (type, size, fabric) so rows with same product name
      // cluster together; tiebreak by orderCount desc so heaviest combos
      // float to the top within a (type,size,fabric) bucket.
      { $sort: { type: 1, size: 1, fabricType: 1, orderCount: -1 } },
    ]);

    // Resolve fabric codes → labels in one batch lookup.
    const fabricCodes = Array.from(
      new Set(rows.map((r: { fabricType: string }) => r.fabricType).filter(Boolean)),
    );
    const fabricMap = new Map<string, string>();
    if (fabricCodes.length > 0) {
      const docs = await this.workshopConfigRepository.findAll({
        category: WorkshopConfigCategory.FabricType,
        code: { $in: fabricCodes },
      });
      for (const d of docs) fabricMap.set(d.code, d.name);
    }

    const groups: ImportSummaryGroup[] = rows.map(
      (r: {
        type: string;
        size: string;
        fabricType: string;
        totalQuantity: number;
        orderCount: number;
        sampleProductionIds: string[];
      }) => ({
        type: r.type,
        size: r.size,
        fabricType: r.fabricType,
        fabricName: r.fabricType ? fabricMap.get(r.fabricType) : undefined,
        totalQuantity: r.totalQuantity,
        orderCount: r.orderCount,
        sampleProductionIds: r.sampleProductionIds,
      }),
    );

    const totalOrders = groups.reduce((s, g) => s + g.orderCount, 0);
    const totalQuantity = groups.reduce((s, g) => s + g.totalQuantity, 0);

    return {
      success: true,
      data: {
        date: dayStart.toISOString().slice(0, 10),
        totalOrders,
        totalQuantity,
        groups,
      },
    };
  }

  async deleteOrder(id: string, ctx?: AuditContext) {
    const o = await this.orderRepository.findOne({ _id: id });
    if (!o) throw new NotFoundException('Order not found');
    const result = await this.orderRepository.softDelete({ _id: id });
    void this.orderLogService.write({ orderId: id, action: 'delete', ctx });
    void this.invalidateListCache();
    return result;
  }

  /**
   * Inline update one workshop field on one order.
   *
   * Flow:
   *   1. Check role can edit this field
   *   2. Validate value against workshop_config (skip for free text)
   *   3. Build $set patch + recompute readyForFulfill if toolResultNote changed
   *   4. findOneAndUpdate, return new doc
   *   5. Invalidate list cache
   *
   * Audit log (OrderLog) push will be added in Phase 3.
   */
  async updateField(
    id: string,
    dto: UpdateOrderFieldDto,
    roleName?: RoleType,
    ctx?: AuditContext,
  ): Promise<UpdateOrderFieldResDto> {
    this.assertCanEditField(dto.field, roleName);
    await this.assertValueAllowed(dto.field, dto.value);

    const before = await this.orderRepository.findOneById(id);
    if (!before) throw new NotFoundException('Order not found');

    const normalized = dto.value === '' ? null : dto.value;
    const patch: Record<string, unknown> = { [dto.field]: normalized };

    if (dto.field === 'toolResultNote') {
      patch.readyForFulfill = normalized === READY_FOR_FULFILL_CODE;
    }

    const updated = await this.orderRepository.findOneAndUpdate({ _id: id }, patch);
    if (!updated) throw new NotFoundException('Order not found');

    void this.orderLogService.write({
      orderId: id,
      action: 'update',
      field: dto.field,
      before: (before as unknown as Record<string, unknown>)[dto.field] ?? null,
      after: normalized,
      ctx,
    });

    void this.invalidateListCache();

    return { success: true, data: updated };
  }

  /**
   * Bulk-apply one workshop field across many orders. Same permission + value
   * validation as `updateField`. Uses a single `updateMany` so cache invalidates
   * once and DB does a single write batch.
   */
  async bulkUpdateField(
    dto: BulkUpdateOrderFieldDto,
    roleName?: RoleType,
    ctx?: AuditContext,
  ): Promise<BulkUpdateOrderFieldResDto> {
    this.assertCanEditField(dto.field, roleName);
    await this.assertValueAllowed(dto.field, dto.value);

    const normalized = dto.value === '' ? null : dto.value;
    const patch: Record<string, unknown> = { [dto.field]: normalized };
    if (dto.field === 'toolResultNote') {
      patch.readyForFulfill = normalized === READY_FOR_FULFILL_CODE;
    }

    // Snapshot before-values for the audit log. Cheap because we only need the
    // field being changed plus _id.
    const beforeDocs = await this.orderModel
      .find({ _id: { $in: dto.ids }, deletedAt: { $exists: false } }, { _id: 1, [dto.field]: 1 })
      .lean();

    const result = await this.orderModel.updateMany({ _id: { $in: dto.ids }, deletedAt: { $exists: false } }, { $set: patch });

    void this.orderLogService.writeMany(
      beforeDocs.map((doc) => ({
        orderId: (doc._id as unknown as { toString(): string }).toString(),
        action: 'bulk_update' as const,
        field: dto.field,
        before: (doc as unknown as Record<string, unknown>)[dto.field] ?? null,
        after: normalized,
        ctx,
      })),
    );

    void this.invalidateListCache();

    return {
      success: true,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      },
    };
  }

  async getLogs(orderId: string, dto: import('shared').GetOrderLogsDto) {
    return this.orderLogService.listByOrder(orderId, dto);
  }

  /**
   * Split designs into display URLs + original URLs.
   * Returns undefined for empty inputs.
   */
  private processDesigns(
    input?: DesignFields,
    ctx?: string,
  ): { designs?: DesignFields; designsOriginal?: DesignFields } {
    if (!input) return {};
    const display: DesignFields = {};
    const original: DesignFields = {};
    let hasAny = false;
    for (const [k, v] of Object.entries(input)) {
      if (v && typeof v === 'string' && v.trim()) {
        const raw = v.trim();
        const { url, originalUrl } = processImageUrl(raw, { keepOriginal: true });
        if (url !== raw) {
          // eslint-disable-next-line no-console
          console.log(`[transform] ${ctx ?? ''} designs.${k}: ${raw} → ${url}`);
        }
        display[k as keyof DesignFields] = url;
        original[k as keyof DesignFields] = originalUrl;
        hasAny = true;
      }
    }
    if (!hasAny) return {};
    return { designs: display, designsOriginal: original };
  }

  /**
   * Re-process all existing orders' mockupUrl + designs through the URL
   * transformation, populating BOTH display URL and originalUrl. Useful for
   * backfilling data imported before the dual-URL split. Idempotent.
   *
   * For existing data we no longer have the user's original URL string, so
   * `originalUrl` is reconstructed via `canonicalDriveUrl` (a canonical share URL).
   */
  async refreshImageUrls(): Promise<{ scanned: number; updated: number }> {
    const all = await this.orderModel
      .find({}, { _id: 1, mockupUrl: 1, mockupOriginalUrl: 1, designs: 1, designsOriginal: 1, productionId: 1 })
      .lean();
    let updated = 0;

    for (const o of all) {
      const patch: Record<string, unknown> = {};

      if (o.mockupUrl) {
        const newDisplay = transformDriveUrl(o.mockupUrl);
        const newOriginal = canonicalDriveUrl(o.mockupUrl);
        if (newDisplay !== o.mockupUrl) patch.mockupUrl = newDisplay;
        if (!o.mockupOriginalUrl || o.mockupOriginalUrl !== newOriginal) patch.mockupOriginalUrl = newOriginal;
      }

      if (o.designs) {
        const newDesigns: Record<string, string> = {};
        const newOriginal: Record<string, string> = {};
        let designsChanged = false;
        let originalChanged = false;
        const existingOriginal: Record<string, string> = (o.designsOriginal as Record<string, string>) || {};

        for (const [k, v] of Object.entries(o.designs)) {
          if (typeof v === 'string' && v) {
            const display = transformDriveUrl(v);
            const original = canonicalDriveUrl(v);
            newDesigns[k] = display;
            newOriginal[k] = original;
            if (display !== v) designsChanged = true;
            if (!existingOriginal[k] || existingOriginal[k] !== original) originalChanged = true;
          }
        }
        if (designsChanged) patch.designs = newDesigns;
        if (originalChanged) patch.designsOriginal = newOriginal;
      }

      if (Object.keys(patch).length > 0) {
        await this.orderModel.updateOne({ _id: o._id }, { $set: patch });
        updated++;
        // eslint-disable-next-line no-console
        console.log(`[refresh] ${o.productionId}: ${Object.keys(patch).join(', ')}`);
      }
    }

    void this.invalidateListCache();
    return { scanned: all.length, updated };
  }

  async importOrders(dto: ImportProductionOrdersDto, ctx?: AuditContext): Promise<ImportProductionOrdersResDto> {
    const skipped: Array<{ row: number; reason: string }> = [];
    let imported = 0;
    let updated = 0;
    let mapped = 0;
    let unmapped = 0;
    const logRows: Array<{
      orderId: string;
      action: 'create' | 'update';
      after: Record<string, unknown>;
    }> = [];

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i];
      try {
        if (!row.productionId?.trim()) {
          skipped.push({ row: i + 1, reason: 'Missing Production ID' });
          continue;
        }

        // Map by Type → ProductConfig.fullName (case-insensitive exact match)
        let isMapped = false;
        let productConfigId: string | undefined;
        let factoryId: string | undefined;
        let machineTypeId: string | undefined;
        let fabricType: string | undefined;

        if (row.type?.trim()) {
          const pc = await this.productConfigRepository.findOne({
            fullName: { $regex: '^' + escapeRegex(row.type.trim()) + '$', $options: 'i' },
          });
          if (pc) {
            isMapped = true;
            productConfigId = pc._id;
            factoryId = pc.factoryId;
            machineTypeId = pc.machineTypeId;
            fabricType = pc.fabricType || undefined;
            mapped++;
          } else {
            unmapped++;
          }
        } else {
          unmapped++;
        }

        const data = {
          productionId: row.productionId.trim(),
          userSku: row.userSku?.trim(),
          userEmail: row.userEmail?.trim(),
          type: row.type?.trim(),
          color: row.color?.trim(),
          size: row.size?.trim(),
          ...(() => {
            if (!row.mockupUrl) return {};
            const raw = row.mockupUrl.trim();
            const { url, originalUrl } = processImageUrl(raw, { keepOriginal: true });
            if (url !== raw) {
              // eslint-disable-next-line no-console
              console.log(`[transform] ${row.productionId} mockup: ${raw} → ${url}`);
            }
            return { mockupUrl: url, mockupOriginalUrl: originalUrl };
          })(),
          printMethod: row.printMethod?.trim(),
          weight: row.weight,
          width: row.width,
          height: row.height,
          length: row.length,
          quantity: row.quantity ?? 1,
          baseCost: row.baseCost,
          shipCost: row.shipCost,
          ...this.processDesigns(row.designs, row.productionId),
          status: row.status?.trim(),
          orderId: row.orderId?.trim(),
          externalId: row.externalId?.trim(),
          referent: row.referent?.trim(),
          orderAt: row.orderAt ? new Date(row.orderAt) : undefined,
          inProductionAt: row.inProductionAt ? new Date(row.inProductionAt) : undefined,
          isMapped,
          productConfigId,
          factoryId,
          machineTypeId,
          fabricType,
        };

        // Atomic upsert by productionId — includes soft-deleted records
        const existed = await this.orderModel.exists({ productionId: data.productionId });
        const upserted = await this.orderModel.findOneAndUpdate(
          { productionId: data.productionId },
          { $set: data, $setOnInsert: { createdAt: new Date() } },
          { upsert: true, new: true },
        );
        if (existed) {
          updated++;
        } else {
          imported++;
        }
        if (upserted?._id) {
          logRows.push({
            orderId: String(upserted._id),
            action: existed ? 'update' : 'create',
            after: { productionId: data.productionId, type: data.type, isMapped },
          });
        }
      } catch (error) {
        skipped.push({
          row: i + 1,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    void this.orderLogService.writeMany(
      logRows.map((r) => ({
        orderId: r.orderId,
        action: 'import' as const,
        // record the actual create/update inside the after payload so the
        // timeline shows whether this import inserted or updated a row.
        after: { ...r.after, _subAction: r.action },
        ctx,
      })),
    );

    void this.invalidateListCache();
    return { success: true, data: { imported, updated, mapped, unmapped, skipped } };
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function round2(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Clothing size sort priority. Lower = comes first.
 *
 * Handles:
 *   - Standard codes (XS, S, M, L, XL)
 *   - Multi-X variants (XXL, XXXL, 4XL, 5XL, ...)
 *   - Common aliases (2XL = XXL, 3XL = XXXL)
 *   - Unknown/numeric sizes are sorted after the standard ones, alphabetically.
 */
function sizeRank(raw: string): number {
  const s = (raw || '').trim().toUpperCase();
  if (!s || s === '—') return 1000;

  const table: Record<string, number> = {
    XS: 0,
    S: 1,
    M: 2,
    L: 3,
    XL: 4,
    XXL: 5,
    '2XL': 5,
    XXXL: 6,
    '3XL': 6,
    XXXXL: 7,
    '4XL': 7,
    XXXXXL: 8,
    '5XL': 8,
    '6XL': 9,
    '7XL': 10,
    '8XL': 11,
  };
  return table[s] ?? 500;
}

function compareSize(a: string, b: string): number {
  const ra = sizeRank(a);
  const rb = sizeRank(b);
  if (ra !== rb) return ra - rb;
  // Same rank or both unknown — fall back to natural string compare
  return a.localeCompare(b, undefined, { numeric: true });
}
