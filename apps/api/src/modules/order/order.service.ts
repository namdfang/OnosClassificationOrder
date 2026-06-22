import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import type {
  BulkAssignDesignerDto,
  BulkAssignDesignerPreviewDto,
  BulkAssignDesignerPreviewResDto,
  BulkAssignDesignerResDto,
  BulkTransferOrderDto,
  BulkUpdateOrderFieldDto,
  BulkUpdateOrderFieldResDto,
  DesignerBreakdownResDto,
  DesignerStatusCounts,
  GetErrorLogDto,
  GetErrorLogResDto,
  SetProductionErrorDto,
  SetProductionErrorResDto,
  BreakdownBucket,
  DesignFields,
  FactoryBreakdown,
  FactoryBucket,
  FactoryFlow,
  FactoryOverviewCell,
  GetFactoryOverviewDto,
  GetFactoryOverviewResDto,
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
  TransferOrderDto,
  TransferOrderResDto,
  TypeSummary,
  UpdateOrderFieldDto,
  UpdateOrderFieldResDto,
  UserBreakdown,
} from 'shared';
import {
  DESIGNER_REASSIGNABLE_STATUSES,
  DesignerStatus,
  RoleType,
  WorkshopConfigCategory,
} from 'shared';
import { Logger } from 'winston';

import { canonicalDriveUrl, processImageUrl, transformDriveUrl } from '@/utils/transform-drive-url';

import { DesignImageService } from '../design-image/design-image.service';
import {
  DESIGN_IMAGE_QUEUE,
  DesignImageJobData,
} from '../design-image/design-image.processor';
import { FactoryRepository } from '../factory/factory.repository';
import { OrderLogRepository } from '../order-log/order-log.repository';
import { OrderLogService } from '../order-log/order-log.service';
import type { AuditContext } from '../order-log/order-log.service';
import { ProductConfigRepository } from '../product-config/product-config.repository';
import { RedisCacheService } from '../redis-cache/redis-cache.service';
import { RoleRepository } from '../role/role.repository';
import { TelegramNotificationService } from '../telegram-notification/telegram-notification.service';
import { UserEntity } from '../user/user.entity';
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
  // assignee đã chuyển sang lưu user._id (không qua workshop_config). Validate
  // qua `assertAssigneeUserValid` thay vì `assertValueAllowed`.
  assignee: null,
  assigneeNote: WorkshopConfigCategory.AssigneeNote,
  fabricType: WorkshopConfigCategory.FabricType,
  machineNumber: WorkshopConfigCategory.Machine,
  productionError: WorkshopConfigCategory.ProductionError,
  productionErrorNote: null, // free text
};

const ADMIN_ROLES: RoleType[] = [RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager];

const FIELD_EDIT_ROLES: Record<OrderWorkshopField, RoleType[]> = {
  printStatus: [...ADMIN_ROLES, RoleType.Fulfillment],
  printStatusNote: [...ADMIN_ROLES, RoleType.Fulfillment],
  toolResult: [...ADMIN_ROLES, RoleType.DesignerLeader, RoleType.Designer],
  // Phase 3 Designer-Task-Workflow: `toolResultNote` không cho sub-designer sửa
  // tay nữa — derive auto khi designer transition 'complete' (state machine set
  // 'ok'). Leader/Admin vẫn override được nếu cần.
  toolResultNote: [...ADMIN_ROLES, RoleType.DesignerLeader],
  errorFile: [...ADMIN_ROLES, RoleType.DesignerLeader, RoleType.Designer],
  errorFileNote: [...ADMIN_ROLES, RoleType.DesignerLeader, RoleType.Designer],
  // Phase 3: chỉ Leader/Admin assign task. Sub-designer transition qua endpoint
  // riêng `POST /orders/:id/designer-transition`.
  assignee: [...ADMIN_ROLES, RoleType.DesignerLeader],
  assigneeNote: [...ADMIN_ROLES, RoleType.DesignerLeader, RoleType.Designer],
  // Fabric is admin-managed (it's a product attribute, not a workshop status).
  fabricType: ADMIN_ROLES,
  // Máy: xưởng (Leader/Designer/Fulfillment) tự đổi máy nếu phải chuyển máy in,
  // không cần đợi admin sửa ProductConfig + backfill lại.
  machineNumber: [...ADMIN_ROLES, RoleType.DesignerLeader, RoleType.Designer, RoleType.Fulfillment],
  // Fulfillment (xưởng) là người báo lỗi sản xuất → cần quyền edit.
  productionError: [...ADMIN_ROLES, RoleType.Fulfillment],
  productionErrorNote: [...ADMIN_ROLES, RoleType.Fulfillment],
  productionErrorSource: [...ADMIN_ROLES, RoleType.DesignerLeader, RoleType.Fulfillment],
};

const READY_FOR_FULFILL_CODE = 'ok';

/**
 * Mã printStatus đại diện cho đơn đã in xong qua máy đó. Workshop set
 * printStatus = "machine-N" để đánh dấu đơn vừa in xong qua máy N. Bất kỳ
 * code nào khác (vd. "in-progress", "queued") coi như đang in.
 *
 * Dùng chung giữa `getStatusOverview()`, `getFactoryOverview()`, và filter
 * `printStage` của list orders để 3 chỗ luôn nhất quán.
 */
const PRINTED_MACHINE_CODES = ['machine-1', 'machine-2', 'machine-3', 'machine-4', 'machine-94'];

const ORDER_LIST_CACHE_PREFIX = 'orders:list:';
const ORDER_LIST_CACHE_TTL_SECONDS = 60;

@Injectable()
export class OrderService implements OnModuleInit {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly productConfigRepository: ProductConfigRepository,
    private readonly workshopConfigRepository: WorkshopConfigRepository,
    private readonly orderLogService: OrderLogService,
    private readonly orderLogRepository: OrderLogRepository,
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderDocument>,
    @Inject('winston') private readonly logger: Logger,
    private readonly redisCacheService: RedisCacheService,
    private readonly factoryRepository: FactoryRepository,
    private readonly telegramNotificationService: TelegramNotificationService,
    private readonly designImageService: DesignImageService,
    @InjectQueue(DESIGN_IMAGE_QUEUE) private readonly designQueue: Queue<DesignImageJobData>,
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
    private readonly roleRepository: RoleRepository,
  ) {}

  /** Validate giá trị assignee là userId hợp lệ (user role=Designer, active). */
  private async assertAssigneeUserValid(userId: string | null): Promise<void> {
    if (!userId) return;
    const designerRole = await this.roleRepository.findOne({ name: RoleType.Designer });
    const u = await this.userModel
      .findOne({ _id: userId, roleId: designerRole?._id }, { _id: 1 })
      .lean();
    if (!u) {
      throw new BadRequestException(
        `User ${userId} không phải sub-designer hợp lệ (không tìm thấy hoặc không phải role Designer).`,
      );
    }
  }

  /**
   * One-shot backfill — every order has an `originalFactoryId` so the factory
   * transfer dashboard can tell "still here" vs "received from elsewhere".
   * Legacy rows imported before this field existed copy their current
   * `factoryId` into the new column (treats them as "pure", never transferred).
   */
  async onModuleInit() {
    const result = await this.orderModel.updateMany(
      { originalFactoryId: { $exists: false }, factoryId: { $exists: true, $ne: null } },
      [{ $set: { originalFactoryId: '$factoryId' } }],
    );
    if (result.modifiedCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`[order-backfill] originalFactoryId set on ${result.modifiedCount} legacy rows`);
    }

    // Backfill productionFirstErrorAt cho đơn legacy đang lỗi mà chưa có
    // timestamp. Heuristic: dùng updatedAt làm best-effort start time (đơn
    // đang lỗi → updatedAt gần đây nhất là lần xưởng đánh lỗi/cập nhật).
    // Idempotent — chỉ set khi field chưa tồn tại.
    const firstErrorRes = await this.orderModel.updateMany(
      {
        productionError: { $exists: true, $nin: [null, ''] },
        productionFirstErrorAt: { $in: [null, undefined] },
        $or: [{ toolResultNote: { $ne: 'ok' } }, { toolResultNote: { $exists: false } }],
      },
      [{ $set: { productionFirstErrorAt: '$updatedAt' } }],
    );
    if (firstErrorRes.modifiedCount > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[order-backfill] productionFirstErrorAt set on ${firstErrorRes.modifiedCount} legacy error rows`,
      );
    }
  }

  /**
   * Per-role visibility filter, applied on top of any client-side query filters.
   *
   *  - Admin / Manager / Support → no restriction (date range optional)
   *  - Designer                  → defaults to last 7 days, override via createdFrom/createdTo
   *  - Fulfillment               → defaults to last 7 days + readyForFulfill, can override date
   *
   * `readyForFulfill` is ALWAYS enforced for Fulfillment regardless of query.
   */
  private buildVisibilityFilter(
    roleName?: RoleType,
    dto?: GetProductionOrdersDto,
    /** = user._id của Designer (sub) — dùng để filter task của mình. */
    assigneeUserId?: string,
    /** = user.factoryId của Fulfillment — scope đơn ở factory này hoặc transfer từ factory này. */
    fulfillmentFactoryId?: string,
  ): Record<string, unknown> {
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
      // Sub-designer chỉ thấy task của mình (assignee = user._id).
      filter.assignee = assigneeUserId || '__no_user__';
      if (hasDateOverride) filter.createdAt = buildRange();
    } else if (roleName === RoleType.Fulfillment) {
      filter.createdAt = hasDateOverride ? buildRange() : { $gte: startOfWindow, $lte: endOfToday };
      filter.readyForFulfill = true;
      // Per-factory scope: thấy đơn đang ở xưởng mình HOẶC đơn đã transfer từ
      // xưởng mình đi nơi khác (origin = mình). Nếu user chưa gán factoryId →
      // trả empty thay vì rò rỉ data.
      if (fulfillmentFactoryId) {
        filter.$or = [
          { factoryId: fulfillmentFactoryId },
          { originalFactoryId: fulfillmentFactoryId },
        ];
      } else {
        filter.factoryId = '__no_factory__';
      }
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
      productionError: dto.productionError,
      hasError: dto.hasError,
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
    assigneeCode?: string,
    fulfillmentFactoryId?: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = this.buildVisibilityFilter(
      roleName,
      dto,
      assigneeCode,
      fulfillmentFactoryId,
    );
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
    if (dto.errorFile) filter.errorFile = { $in: dto.errorFile.split(',').filter(Boolean) };
    // Factory tab filters — exact product name / fabric code / tool code.
    if (dto.type) filter.type = { $in: dto.type.split(',').filter(Boolean) };
    if (dto.fabricType) filter.fabricType = { $in: dto.fabricType.split(',').filter(Boolean) };
    if (dto.toolResult) filter.toolResult = { $in: dto.toolResult.split(',').filter(Boolean) };
    if (dto.machineNumber) {
      filter.machineNumber = { $in: dto.machineNumber.split(',').filter(Boolean) };
    }
    if (dto.designerStatus) {
      const codes = dto.designerStatus.split(',').filter(Boolean);
      // Token đặc biệt __none__ ↔ chưa có field (data legacy)
      const hasNone = codes.includes('__none__');
      const real = codes.filter((c) => c !== '__none__');
      if (hasNone && real.length === 0) {
        filter.designerStatus = { $exists: false };
      } else if (hasNone) {
        filter.$or = [
          ...(Array.isArray(filter.$or) ? (filter.$or as unknown[]) : []),
          { designerStatus: { $exists: false } },
          { designerStatus: { $in: real } },
        ];
      } else {
        filter.designerStatus = { $in: real };
      }
    }
    if (dto.assignee) {
      // Override block phía dưới — nếu user chọn __none__ token, lọc đơn chưa gán.
      const codes = dto.assignee.split(',').filter(Boolean);
      const hasNone = codes.includes('__none__');
      const real = codes.filter((c) => c !== '__none__');
      if (hasNone && real.length === 0) {
        filter.assignee = { $in: [null, ''] };
      } else if (hasNone) {
        filter.$or = [
          ...(Array.isArray(filter.$or) ? (filter.$or as unknown[]) : []),
          { assignee: { $in: [null, ''] } },
          { assignee: { $in: real } },
        ];
      } else {
        filter.assignee = { $in: real };
      }
    }
    if (dto.unmapped === true) {
      // Đơn chưa map xưởng — factoryId null hoặc không tồn tại.
      const unmappedClause = [{ factoryId: { $exists: false } }, { factoryId: null }];
      if (filter.$or) {
        // Đã có $or từ filter khác (vd printStage=not-printed) — chuyển sang $and
        // để cả hai điều kiện cùng phải đúng.
        filter.$and = [{ $or: filter.$or }, { $or: unmappedClause }];
        delete filter.$or;
      } else {
        filter.$or = unmappedClause;
      }
    }
    if (dto.productionError) {
      filter.productionError = { $in: dto.productionError.split(',').filter(Boolean) };
    } else if (dto.hasError === true) {
      // hasError=true → đơn có lỗi xưởng (productionError set khác empty).
      // hasError=false không được hỗ trợ: dùng "không lọc" để xem đơn không
      // lỗi (tránh đụng `$or` với filter search/printStage).
      filter.productionError = { $exists: true, $nin: [null, ''] };
    }

    // Transfer filters — let the factory tab slice orders by direction.
    if (dto.originalFactoryId) {
      filter.originalFactoryId = { $in: dto.originalFactoryId.split(',').filter(Boolean) };
    }
    if (dto.transferStatus) {
      // Supported tokens:
      //   "transferred"             → originalFactoryId !== factoryId
      //   "pure"                    → originalFactoryId == factoryId
      //   "transferred-in:<fid>"    → factoryId=fid AND originalFactoryId != fid
      //   "transferred-out:<fid>"   → originalFactoryId=fid AND factoryId != fid
      const tok = dto.transferStatus.trim();
      if (tok === 'transferred') {
        filter.$expr = { $ne: ['$originalFactoryId', '$factoryId'] };
      } else if (tok === 'pure') {
        filter.$expr = { $eq: ['$originalFactoryId', '$factoryId'] };
      } else if (tok.startsWith('transferred-in:')) {
        const fid = tok.slice('transferred-in:'.length);
        filter.factoryId = fid;
        filter.$expr = { $ne: ['$originalFactoryId', '$factoryId'] };
      } else if (tok.startsWith('transferred-out:')) {
        const fid = tok.slice('transferred-out:'.length);
        filter.originalFactoryId = fid;
        filter.$expr = { $ne: ['$originalFactoryId', '$factoryId'] };
      }
    }
    if (dto.printStage) {
      // Mã printStatus được set bằng tên máy in khi đơn đã in xong — bất kỳ
      // mã nào không thuộc danh sách này coi như "đang in" (đã pick lên máy
      // chưa done). Null/empty = chưa in.
      if (dto.printStage === 'printed') {
        filter.printStatus = { $in: PRINTED_MACHINE_CODES };
      } else if (dto.printStage === 'printing') {
        filter.printStatus = { $exists: true, $nin: [null, '', ...PRINTED_MACHINE_CODES] };
      } else if (dto.printStage === 'not-printed') {
        filter.$or = [{ printStatus: { $exists: false } }, { printStatus: { $in: [null, ''] } }];
      }
    }
    return filter;
  }

  async getOrders(
    dto: GetProductionOrdersDto,
    roleName?: RoleType,
    assigneeCode?: string,
    fulfillmentFactoryId?: string,
  ): Promise<GetProductionOrdersResDto> {
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
    const filter = this.buildOrderListFilter(dto, roleName, assigneeCode, fulfillmentFactoryId);

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
   * Export EVERY order matching the current filter (no pagination). Used by
   * the "Đơn hàng theo xưởng" tab to dump the visible scope to a spreadsheet.
   * Populates factory / machineType / productConfig so FE can render names
   * without an extra lookup. Caller is responsible for capping payload — the
   * filter (date range + factory + product/fabric/tool/machine) should keep
   * this bounded to a few thousand rows in practice.
   */
  async exportOrders(
    dto: GetProductionOrdersDto,
    roleName?: RoleType,
    assigneeCode?: string,
    fulfillmentFactoryId?: string,
  ): Promise<{ success: true; data: unknown[]; total: number }> {
    const filter = this.buildOrderListFilter(dto, roleName, assigneeCode, fulfillmentFactoryId);
    const data = await this.orderRepository.findAll(filter, {
      sort: { type: 1, size: 1, fabricType: 1, createdAt: -1 },
      populate: [
        { path: 'factory', select: ['name', 'shortName'] },
        { path: 'machineType', select: ['name', 'shortName'] },
        { path: 'productConfig', select: ['fullName', 'shortName'] },
      ],
    });
    return { success: true, data: data as unknown[], total: data.length };
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
    assigneeCode?: string,
    fulfillmentFactoryId?: string,
  ): Promise<GetGroupedProductionOrdersResDto> {
    const { page, limit } = dto;
    const filter = this.buildOrderListFilter(dto, roleName, assigneeCode, fulfillmentFactoryId);

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
  async getDashboard(
    dto: GetOrderDashboardDto,
    roleName?: RoleType,
  ): Promise<GetOrderDashboardResDto> {
    // [cache disabled]
    // const cacheKey = `orders:dashboard:${Buffer.from(JSON.stringify(dto)).toString('base64')}`;
    // try {
    //   const cached = await this.redisCacheService.getKey(cacheKey);
    //   if (cached) return JSON.parse(cached);
    // } catch { /* fall through */ }

    const match: Record<string, unknown> = {};
    // Fulfillment chỉ xử lý đơn đã Ok (Designer đã đánh dấu) — apply ở mọi
    // aggregation để cards / breakdown / byUser cũng phản ánh đúng scope.
    if (roleName === RoleType.Fulfillment) {
      match.readyForFulfill = true;
    }
    if (dto.startDate || dto.endDate) {
      const range: Record<string, Date> = {};
      if (dto.startDate) range.$gte = new Date(dto.startDate);
      if (dto.endDate) {
        const end = new Date(dto.endDate);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      // Filter by `createdAt` (import time) — `orderAt` is when the customer
      // placed the order at the marketplace and can be days/weeks earlier,
      // which doesn't match what users expect when picking "today" on the
      // production dashboard.
      match.createdAt = range;
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
    assigneeCode?: string,
    fulfillmentFactoryId?: string,
  ): Promise<GetOrderStatusOverviewResDto> {
    // Build base match — same filters as list, including visibility rule.
    const baseMatch = this.buildVisibilityFilter(
      roleName,
      { createdFrom: dto.createdFrom, createdTo: dto.createdTo } as GetProductionOrdersDto,
      assigneeCode,
      fulfillmentFactoryId,
    );

    if (dto.printStatus) baseMatch.printStatus = { $in: dto.printStatus.split(',').filter(Boolean) };
    if (dto.printStatusNote) baseMatch.printStatusNote = { $in: dto.printStatusNote.split(',').filter(Boolean) };
    if (dto.toolResult) baseMatch.toolResult = { $in: dto.toolResult.split(',').filter(Boolean) };
    if (dto.toolResultNote) baseMatch.toolResultNote = { $in: dto.toolResultNote.split(',').filter(Boolean) };
    if (dto.errorFile) baseMatch.errorFile = { $in: dto.errorFile.split(',').filter(Boolean) };
    if (dto.assignee) baseMatch.assignee = { $in: dto.assignee.split(',').filter(Boolean) };
    if (dto.assigneeNote) baseMatch.assigneeNote = { $in: dto.assigneeNote.split(',').filter(Boolean) };
    if (dto.productionError) {
      baseMatch.productionError = { $in: dto.productionError.split(',').filter(Boolean) };
    } else if (dto.hasError === true) {
      baseMatch.productionError = { $exists: true, $nin: [null, ''] };
    }
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
            {
              $match: {
                $or: [
                  { toolResultNote: 'error' },
                  { errorFile: { $ne: null, $exists: true } },
                  { productionError: { $exists: true, $nin: [null, ''] } },
                ],
              },
            },
            { $count: 'n' },
          ],
          printStatus: groupByField('printStatus'),
          printStatusNote: groupByField('printStatusNote'),
          toolResult: groupByField('toolResult'),
          toolResultNote: groupByField('toolResultNote'),
          errorFile: groupByField('errorFile'),
          productionError: groupByField('productionError'),
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
      productionError: mapBreakdown(WorkshopConfigCategory.ProductionError, agg.productionError),
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

  /**
   * Move a single order to a different factory. Only `factoryId` mutates; the
   * `originalFactoryId` stays pinned to where it was first imported so the
   * dashboard can show "received from ML" vs "originally here".
   */
  async transferOrder(
    id: string,
    dto: TransferOrderDto,
    ctx?: AuditContext,
  ): Promise<TransferOrderResDto> {
    const order = await this.orderRepository.findOne({ _id: id });
    if (!order) throw new NotFoundException('Order not found');
    if (order.factoryId === dto.targetFactoryId) {
      return { success: true, data: { matched: 1, modified: 0 } };
    }
    const before = { factoryId: order.factoryId };
    await this.orderRepository.findOneAndUpdate({ _id: id }, { factoryId: dto.targetFactoryId });
    void this.orderLogService.write({
      orderId: id,
      action: 'transfer',
      before,
      after: { factoryId: dto.targetFactoryId, reason: dto.reason },
      ctx,
    });
    void this.invalidateListCache();
    return { success: true, data: { matched: 1, modified: 1 } };
  }

  async bulkTransferOrders(
    dto: BulkTransferOrderDto,
    ctx?: AuditContext,
  ): Promise<TransferOrderResDto> {
    // Skip rows already at target so we don't write no-op logs.
    const eligible = await this.orderModel
      .find({ _id: { $in: dto.ids }, factoryId: { $ne: dto.targetFactoryId } })
      .select({ _id: 1, factoryId: 1 })
      .lean();
    const eligibleIds = eligible.map((o) => String(o._id));
    if (eligibleIds.length === 0) {
      return { success: true, data: { matched: dto.ids.length, modified: 0 } };
    }
    const res = await this.orderModel.updateMany(
      { _id: { $in: eligibleIds } },
      { $set: { factoryId: dto.targetFactoryId } },
    );
    void this.orderLogService.writeMany(
      eligible.map((o) => ({
        orderId: String(o._id),
        action: 'transfer' as const,
        before: { factoryId: o.factoryId },
        after: { factoryId: dto.targetFactoryId, reason: dto.reason },
        ctx,
      })),
    );
    void this.invalidateListCache();
    return {
      success: true,
      data: { matched: dto.ids.length, modified: res.modifiedCount || 0 },
    };
  }

  /**
   * Dashboard payload for the "Đơn hàng theo xưởng" tab.
   *  - `factories[i]` = totals at factory i + how many transferred in/out
   *  - `flows[]` = origin→current pairs with non-trivial count
   *  - `totals` = grand total + transferred + pure
   */
  async getFactoryOverview(
    dto: GetFactoryOverviewDto,
    roleName?: RoleType,
    fulfillmentFactoryId?: string,
  ): Promise<GetFactoryOverviewResDto> {
    const match: Record<string, unknown> = {};
    // Fulfillment chỉ thấy đơn đã Ok — apply scope cho cells + flow + dropdowns.
    if (roleName === RoleType.Fulfillment) {
      match.readyForFulfill = true;
      if (fulfillmentFactoryId) {
        match.$or = [
          { factoryId: fulfillmentFactoryId },
          { originalFactoryId: fulfillmentFactoryId },
        ];
      } else {
        match.factoryId = '__no_factory__';
      }
    }
    if (dto.createdFrom || dto.createdTo) {
      const range: Record<string, Date> = {};
      if (dto.createdFrom) range.$gte = new Date(dto.createdFrom);
      if (dto.createdTo) {
        const end = new Date(dto.createdTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      match.createdAt = range;
    }
    // `matchMapped` đếm/aggregate đơn đã map xưởng — Cards/flow/stats đều
    // cần `factoryId` để classify. `match` (chưa gắn) dùng cho `unmapped`
    // count và optional dropdown khi user chọn chip "Chưa xác định".
    const matchMapped: Record<string, unknown> = {
      ...match,
      factoryId: { $exists: true, $ne: null },
      originalFactoryId: { $exists: true, $ne: null },
    };

    // Đơn chưa map xưởng trong cùng date range — đếm độc lập, dùng cho chip
    // "Chưa xác định xưởng" trên FE.
    const unmappedCount = await this.orderModel.countDocuments({
      ...match,
      $or: [{ factoryId: { $exists: false } }, { factoryId: null }],
    });

    type FlowRow = { _id: { from: string; to: string }; count: number; totalQuantity: number };
    const flowRows = await this.orderModel.aggregate<FlowRow>([
      { $match: matchMapped },
      {
        $group: {
          _id: { from: '$originalFactoryId', to: '$factoryId' },
          count: { $sum: 1 },
          totalQuantity: { $sum: { $ifNull: ['$quantity', 1] } },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // One bulk fetch for factory names — both endpoints of every flow.
    const factoryIds = Array.from(
      new Set(flowRows.flatMap((f) => [f._id.from, f._id.to]).filter(Boolean)),
    );
    const factoryDocs = factoryIds.length
      ? await (this.orderModel.db.collection('factories') as unknown as {
          find: (q: Record<string, unknown>) => {
            toArray: () => Promise<Array<{ _id: unknown; name: string; shortName?: string }>>;
          };
        })
          .find({ _id: { $in: factoryIds } })
          .toArray()
      : [];
    const fmap = new Map<string, { name: string; shortName?: string }>();
    for (const f of factoryDocs) {
      fmap.set(String(f._id), { name: f.name, shortName: f.shortName });
    }

    // Build per-factory totals from flowRows.
    const cellMap = new Map<string, FactoryOverviewCell>();
    const ensureCell = (fid: string): FactoryOverviewCell => {
      let cell = cellMap.get(fid);
      if (!cell) {
        const meta = fmap.get(fid) || { name: 'Unknown', shortName: undefined };
        cell = {
          factoryId: fid,
          factoryName: meta.name,
          factoryShortName: meta.shortName,
          total: 0,
          pure: 0,
          transferredIn: 0,
          transferredOut: 0,
          productCount: 0,
          fabricCount: 0,
          machineCount: 0,
          actualMachineCount: 0,
          withToolCount: 0,
          printedCount: 0,
          printingCount: 0,
          notPrintedCount: 0,
          errorCount: 0,
          breakdowns: { products: [], fabrics: [], sizes: [], toolResults: [] },
        };
        cellMap.set(fid, cell);
      }
      return cell;
    };

    let grandTotal = 0;
    let transferred = 0;
    let pure = 0;
    for (const r of flowRows) {
      grandTotal += r.count;
      const from = r._id.from;
      const to = r._id.to;
      const isPure = from === to;
      if (isPure) {
        pure += r.count;
        const cell = ensureCell(to);
        cell.total += r.count;
        cell.pure += r.count;
      } else {
        transferred += r.count;
        const cellTo = ensureCell(to);
        cellTo.total += r.count;
        cellTo.transferredIn += r.count;
        const cellFrom = ensureCell(from);
        cellFrom.transferredOut += r.count;
      }
    }

    const flows: FactoryFlow[] = flowRows
      .filter((r) => r._id.from !== r._id.to)
      .map((r) => {
        const fmeta = fmap.get(r._id.from) || { name: '?', shortName: undefined };
        const tmeta = fmap.get(r._id.to) || { name: '?', shortName: undefined };
        return {
          fromFactoryId: r._id.from,
          fromName: fmeta.name,
          fromShortName: fmeta.shortName,
          toFactoryId: r._id.to,
          toName: tmeta.name,
          toShortName: tmeta.shortName,
          count: r.count,
          totalQuantity: r.totalQuantity,
        };
      });

    // ─── Per-factory stats: distinct products/fabrics + with-tool counts ───
    // Tool codes whose `name` starts with "Có" mean the product has a tool.
    // We resolve once and keep the IDs for an aggregation match.
    const toolHasCodes = (
      await this.workshopConfigRepository.findAll({
        category: WorkshopConfigCategory.ToolResult,
        name: { $regex: '^Có', $options: 'i' },
      })
    ).map((d) => d.code);

    type StatRow = {
      _id: string;
      productCount: number;
      fabricCount: number;
      machineCount: number;
      actualMachineCount: number;
      withToolCount: number;
      printedCount: number;
      printingCount: number;
      notPrintedCount: number;
      errorCount: number;
    };
    const statRows = await this.orderModel.aggregate<StatRow>([
      { $match: matchMapped },
      {
        $group: {
          _id: '$factoryId',
          types: { $addToSet: '$type' },
          fabrics: { $addToSet: '$fabricType' },
          // `machines` (legacy name) đếm machineTypeId → đây là "Phòng" / loại
          // máy in. `actualMachines` đếm machineNumber → số máy thực (94/27/56).
          machines: { $addToSet: '$machineTypeId' },
          actualMachines: { $addToSet: '$machineNumber' },
          withToolCount: {
            $sum: { $cond: [{ $in: ['$toolResult', toolHasCodes] }, 1, 0] },
          },
          // 3 print stage — disjoint, cộng lại = total
          printedCount: {
            $sum: { $cond: [{ $in: ['$printStatus', PRINTED_MACHINE_CODES] }, 1, 0] },
          },
          printingCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: [{ $ifNull: ['$printStatus', ''] }, ''] },
                    { $not: [{ $in: ['$printStatus', PRINTED_MACHINE_CODES] }] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          notPrintedCount: {
            $sum: { $cond: [{ $eq: [{ $ifNull: ['$printStatus', ''] }, ''] }, 1, 0] },
          },
          // Lỗi xưởng — đếm độc lập với 3 print stage (một đơn có thể vừa
          // chưa in vừa được báo lỗi, hoặc đã in xong nhưng phát hiện lỗi).
          errorCount: {
            $sum: { $cond: [{ $ne: [{ $ifNull: ['$productionError', ''] }, ''] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 1,
          productCount: {
            $size: { $filter: { input: '$types', as: 't', cond: { $and: [{ $ne: ['$$t', null] }, { $ne: ['$$t', ''] }] } } },
          },
          fabricCount: {
            $size: { $filter: { input: '$fabrics', as: 'f', cond: { $and: [{ $ne: ['$$f', null] }, { $ne: ['$$f', ''] }] } } },
          },
          machineCount: {
            $size: { $filter: { input: '$machines', as: 'm', cond: { $and: [{ $ne: ['$$m', null] }, { $ne: ['$$m', ''] }] } } },
          },
          actualMachineCount: {
            $size: { $filter: { input: '$actualMachines', as: 'a', cond: { $and: [{ $ne: ['$$a', null] }, { $ne: ['$$a', ''] }] } } },
          },
          withToolCount: 1,
          printedCount: 1,
          printingCount: 1,
          notPrintedCount: 1,
          errorCount: 1,
        },
      },
    ]);
    for (const s of statRows) {
      const cell = cellMap.get(s._id);
      if (!cell) continue;
      cell.productCount = s.productCount;
      cell.fabricCount = s.fabricCount;
      cell.machineCount = s.machineCount;
      cell.actualMachineCount = s.actualMachineCount;
      cell.withToolCount = s.withToolCount;
      cell.printedCount = s.printedCount;
      cell.printingCount = s.printingCount;
      cell.notPrintedCount = s.notPrintedCount;
      cell.errorCount = s.errorCount;
    }

    // ─── Per-factory dimension breakdowns (Summary sub-tab) ─────────────
    // Group by (factoryId, field) and count, then bucket into per-factory
    // top-N lists. We pull these 4 aggregations in parallel.
    type BreakdownRow = { _id: { factory: string; v: string }; count: number };
    const breakdownPipeline = (field: string, filterOut: { $ne?: unknown } = {}) => [
      { $match: { ...matchMapped, [field]: { $exists: true, $ne: null, $nin: [''], ...filterOut } } },
      { $group: { _id: { factory: '$factoryId', v: `$${field}` }, count: { $sum: 1 } } },
      { $sort: { count: -1 as const } },
    ];
    const [productBd, fabricBd, sizeBd, toolBd] = await Promise.all([
      this.orderModel.aggregate<BreakdownRow>(breakdownPipeline('type')),
      this.orderModel.aggregate<BreakdownRow>(breakdownPipeline('fabricType')),
      this.orderModel.aggregate<BreakdownRow>(breakdownPipeline('size')),
      this.orderModel.aggregate<BreakdownRow>(breakdownPipeline('toolResult')),
    ]);
    // Resolve fabric + tool codes → names. Product type + size are raw strings.
    const fabricMetaMap = new Map<string, string>(
      (await this.workshopConfigRepository.findAll({ category: WorkshopConfigCategory.FabricType })).map(
        (d) => [d.code, d.name],
      ),
    );
    const toolMetaMap = new Map<string, string>(
      (await this.workshopConfigRepository.findAll({ category: WorkshopConfigCategory.ToolResult })).map(
        (d) => [d.code, d.name],
      ),
    );
    const pushBd = (
      rows: BreakdownRow[],
      key: 'products' | 'fabrics' | 'sizes' | 'toolResults',
      label: (v: string) => string,
      limit = 20,
    ) => {
      const perFactory = new Map<string, BreakdownRow[]>();
      for (const r of rows) {
        const arr = perFactory.get(r._id.factory) || [];
        arr.push(r);
        perFactory.set(r._id.factory, arr);
      }
      for (const [fid, list] of perFactory) {
        const cell = cellMap.get(fid);
        if (!cell) continue;
        cell.breakdowns[key] = list.slice(0, limit).map((r) => ({
          value: r._id.v,
          label: label(r._id.v),
          count: r.count,
        }));
      }
    };
    pushBd(productBd, 'products', (v) => v);
    pushBd(fabricBd, 'fabrics', (v) => fabricMetaMap.get(v) || v);
    pushBd(sizeBd, 'sizes', (v) => v);
    pushBd(toolBd, 'toolResults', (v) => toolMetaMap.get(v) || v);

    // ─── Filter selects: distinct values across the date range ──────────
    // Cross-facet scope: each dropdown counts options applying ALL active
    // filters EXCEPT its own field, so the user can switch values within that
    // facet while other facets reflect the narrowed subset. Cards + flow
    // totals stay unscoped (global view).
    const scopeMatch: Record<string, unknown> =
      dto.unmapped === true
        ? {
            ...match,
            $or: [{ factoryId: { $exists: false } }, { factoryId: null }],
          }
        : { ...matchMapped };
    if (dto.factoryId && dto.unmapped !== true) scopeMatch.factoryId = dto.factoryId;
    if (dto.printStage === 'printed') {
      scopeMatch.printStatus = { $in: PRINTED_MACHINE_CODES };
    } else if (dto.printStage === 'printing') {
      scopeMatch.printStatus = { $exists: true, $nin: [null, '', ...PRINTED_MACHINE_CODES] };
    } else if (dto.printStage === 'not-printed') {
      const printNotClause = [
        { printStatus: { $exists: false } },
        { printStatus: { $in: [null, ''] } },
      ];
      if (scopeMatch.$or) {
        scopeMatch.$and = [{ $or: scopeMatch.$or }, { $or: printNotClause }];
        delete scopeMatch.$or;
      } else {
        scopeMatch.$or = printNotClause;
      }
    }
    if (dto.hasError === true) {
      scopeMatch.productionError = { $exists: true, $nin: [null, ''] };
    }

    /** Faceted filters set by the user via the select dropdowns. */
    const facetFilters: Record<string, unknown> = {};
    if (dto.type) facetFilters.type = { $in: dto.type.split(',').filter(Boolean) };
    if (dto.fabricType) {
      facetFilters.fabricType = { $in: dto.fabricType.split(',').filter(Boolean) };
    }
    if (dto.toolResult) {
      facetFilters.toolResult = { $in: dto.toolResult.split(',').filter(Boolean) };
    }
    if (dto.machineTypeId) facetFilters.machineTypeId = dto.machineTypeId;
    if (dto.machineNumber) {
      facetFilters.machineNumber = { $in: dto.machineNumber.split(',').filter(Boolean) };
    }
    const buildFacetMatch = (excludeKey: keyof typeof facetFilters) => {
      const out: Record<string, unknown> = { ...scopeMatch };
      for (const [k, v] of Object.entries(facetFilters)) {
        if (k === excludeKey) continue;
        out[k] = v;
      }
      return out;
    };

    type OptionRow = { _id: string; count: number };
    const [typeRows, fabricRows, toolRows, machineRows, actualMachineRows] = await Promise.all([
      this.orderModel.aggregate<OptionRow>([
        { $match: { ...buildFacetMatch('type'), type: { $exists: true, $ne: null, $nin: [''] } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.orderModel.aggregate<OptionRow>([
        {
          $match: {
            ...buildFacetMatch('fabricType'),
            fabricType: { $exists: true, $ne: null, $nin: [''] },
          },
        },
        { $group: { _id: '$fabricType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.orderModel.aggregate<OptionRow>([
        {
          $match: {
            ...buildFacetMatch('toolResult'),
            toolResult: { $exists: true, $ne: null, $nin: [''] },
          },
        },
        { $group: { _id: '$toolResult', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.orderModel.aggregate<OptionRow>([
        {
          $match: {
            ...buildFacetMatch('machineTypeId'),
            machineTypeId: { $exists: true, $ne: null, $nin: [''] },
          },
        },
        { $group: { _id: '$machineTypeId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.orderModel.aggregate<OptionRow>([
        {
          $match: {
            ...buildFacetMatch('machineNumber'),
            machineNumber: { $exists: true, $ne: null, $nin: [''] },
          },
        },
        { $group: { _id: '$machineNumber', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Resolve machineTypeId → name via the machineTypes collection.
    const machineIds = machineRows.map((r) => r._id);
    const machineDocs = machineIds.length
      ? await (this.orderModel.db.collection('machineTypes') as unknown as {
          find: (q: Record<string, unknown>) => {
            toArray: () => Promise<Array<{ _id: unknown; name: string; shortName?: string }>>;
          };
        })
          .find({ _id: { $in: machineIds } })
          .toArray()
      : [];
    const machineNameMap = new Map<string, string>();
    for (const m of machineDocs) {
      machineNameMap.set(
        String(m._id),
        m.shortName ? `${m.shortName} · ${m.name}` : m.name,
      );
    }

    // Resolve fabric/tool codes → human-readable names.
    const fabricNameMap = new Map<string, string>(
      (
        await this.workshopConfigRepository.findAll({
          category: WorkshopConfigCategory.FabricType,
        })
      ).map((d) => [d.code, d.name]),
    );
    const toolNameMap = new Map<string, string>(
      (
        await this.workshopConfigRepository.findAll({
          category: WorkshopConfigCategory.ToolResult,
        })
      ).map((d) => [d.code, d.name]),
    );
    // Resolve machineNumber workshop_config codes → human-readable numbers.
    const actualMachineNameMap = new Map<string, string>(
      (
        await this.workshopConfigRepository.findAll({
          category: WorkshopConfigCategory.Machine,
        })
      ).map((d) => [d.code, d.name]),
    );

    return {
      success: true,
      data: {
        factories: Array.from(cellMap.values()).sort((a, b) => b.total - a.total),
        flows,
        totals: { total: grandTotal, transferred, pure, unmapped: unmappedCount },
        availableFilters: {
          products: typeRows.map((r) => ({ value: r._id, label: r._id, count: r.count })),
          fabrics: fabricRows.map((r) => ({
            value: r._id,
            label: fabricNameMap.get(r._id) || r._id,
            count: r.count,
          })),
          toolResults: toolRows.map((r) => ({
            value: r._id,
            label: toolNameMap.get(r._id) || r._id,
            count: r.count,
          })),
          machineTypes: machineRows.map((r) => ({
            value: r._id,
            label: machineNameMap.get(r._id) || r._id,
            count: r.count,
          })),
          machines: actualMachineRows.map((r) => ({
            value: r._id,
            label: actualMachineNameMap.get(r._id) || r._id,
            count: r.count,
          })),
        },
      },
    };
  }

  /**
   * Aggregate workshop facet counts using cross-facet pattern: for each facet
   * (printStatus / toolResultNote / assignee / productionError / fabricType /
   * machineNumber / toolResult / errorFile) aggregate over `buildOrderListFilter`
   * minus the facet's own CSV filter, so user thấy được tất cả options của
   * facet đó nhưng count đã narrow theo các facet khác đang active.
   */
  async getWorkshopAvailableFilters(
    dto: GetProductionOrdersDto,
    roleName?: RoleType,
    assigneeCode?: string,
    fulfillmentFactoryId?: string,
  ): Promise<{
    success: true;
    data: {
      printStatus: Array<{ value: string; label: string; count: number }>;
      toolResultNote: Array<{ value: string; label: string; count: number }>;
      assignee: Array<{ value: string; label: string; count: number }>;
      productionError: Array<{ value: string; label: string; count: number }>;
      fabricType: Array<{ value: string; label: string; count: number }>;
      machineNumber: Array<{ value: string; label: string; count: number }>;
      toolResult: Array<{ value: string; label: string; count: number }>;
      errorFile: Array<{ value: string; label: string; count: number }>;
    };
  }> {
    type FacetKey =
      | 'printStatus'
      | 'toolResultNote'
      | 'assignee'
      | 'productionError'
      | 'fabricType'
      | 'machineNumber'
      | 'toolResult'
      | 'errorFile'
      | 'designerStatus';

    const FACET_KEYS: FacetKey[] = [
      'printStatus',
      'toolResultNote',
      'assignee',
      'productionError',
      'fabricType',
      'machineNumber',
      'toolResult',
      'errorFile',
      'designerStatus',
    ];

    type OptionRow = { _id: string; count: number };
    const aggregateFacet = async (excludeKey: FacetKey, field: FacetKey) => {
      const sanitizedDto = { ...dto, [excludeKey]: undefined } as GetProductionOrdersDto;
      const baseFilter = this.buildOrderListFilter(sanitizedDto, roleName, assigneeCode);
      const facetMatch = {
        ...baseFilter,
        [field]: { $exists: true, $ne: null, $nin: [''] },
      };
      return this.orderModel.aggregate<OptionRow>([
        { $match: facetMatch },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
    };

    const [
      printStatusRows,
      toolResultNoteRows,
      assigneeRows,
      productionErrorRows,
      fabricTypeRows,
      machineNumberRows,
      toolResultRows,
      errorFileRows,
      designerStatusRows,
    ] = await Promise.all(FACET_KEYS.map((k) => aggregateFacet(k, k)));

    const nameMap = async (category: WorkshopConfigCategory) =>
      new Map<string, string>(
        (await this.workshopConfigRepository.findAll({ category })).map((d) => [d.code, d.name]),
      );
    const [
      printStatusMap,
      toolResultNoteMap,
      productionErrorMap,
      fabricTypeMap,
      machineNumberMap,
      toolResultMap,
      errorFileMap,
    ] = await Promise.all([
      nameMap(WorkshopConfigCategory.PrintStatus),
      nameMap(WorkshopConfigCategory.ToolResultNote),
      nameMap(WorkshopConfigCategory.ProductionError),
      nameMap(WorkshopConfigCategory.FabricType),
      nameMap(WorkshopConfigCategory.Machine),
      nameMap(WorkshopConfigCategory.ToolResult),
      nameMap(WorkshopConfigCategory.ErrorFileType),
    ]);

    // Resolve assignee userId → fullName cho label friendly (chỉ những userId
    // có trong facet rows). Userid không tìm thấy → fallback last 4 chars.
    const assigneeUserIds = assigneeRows.map((r) => r._id).filter(Boolean);
    const assigneeUsers = assigneeUserIds.length
      ? await this.userModel
          .find({ _id: { $in: assigneeUserIds } }, { _id: 1, fullName: 1 })
          .lean()
      : [];
    const assigneeMap = new Map<string, string>(
      assigneeUsers.map((u) => [String(u._id), u.fullName]),
    );

    // Designer status — i18n labels VN.
    const DESIGNER_STATUS_LABELS: Record<string, string> = {
      unassigned: 'Chưa gán',
      assigned: 'Cần làm',
      'in-progress': 'Đang làm',
      done: 'Đã xong',
      rejected: 'Đã trả',
      rework: 'Cần làm lại',
    };

    const toOption = (m: Map<string, string>) => (r: OptionRow) => ({
      value: r._id,
      label: m.get(r._id) || r._id,
      count: r.count,
    });

    return {
      success: true,
      data: {
        printStatus: printStatusRows.map(toOption(printStatusMap)),
        toolResultNote: toolResultNoteRows.map(toOption(toolResultNoteMap)),
        assignee: assigneeRows.map((r) => ({
          value: r._id,
          label: assigneeMap.get(r._id) || `#${String(r._id).slice(-4)}`,
          count: r.count,
        })),
        productionError: productionErrorRows.map(toOption(productionErrorMap)),
        fabricType: fabricTypeRows.map(toOption(fabricTypeMap)),
        machineNumber: machineNumberRows.map(toOption(machineNumberMap)),
        toolResult: toolResultRows.map(toOption(toolResultMap)),
        errorFile: errorFileRows.map(toOption(errorFileMap)),
        designerStatus: designerStatusRows.map((r) => ({
          value: r._id,
          label: DESIGNER_STATUS_LABELS[r._id] || r._id,
          count: r.count,
        })),
      },
    };
  }

  /**
   * Re-derive `fabricType`, `toolResult`, AND `machineNumber` from product
   * config for orders that don't have these set yet. Non-destructive: existing
   * values are kept, we only fill blanks.
   *
   * Called manually from `/products` after admin edits fabric/tool/machine
   * defaults, to backfill the rows already in the DB without forcing a
   * re-import. Particularly important for `machineNumber` since it was added
   * after the initial release — every legacy order needs to be filled.
   */
  async backfillOrderFabric(): Promise<{ scanned: number; updated: number }> {
    type Row = { _id: unknown; setFabric?: string; setTool?: string; setMachineNumber?: string };
    const rows = await this.orderModel.aggregate<Row>([
      {
        $match: {
          productConfigId: { $exists: true, $ne: null },
          $or: [
            { fabricType: { $exists: false } },
            { fabricType: null },
            { fabricType: '' },
            { toolResult: { $exists: false } },
            { toolResult: null },
            { toolResult: '' },
            { machineNumber: { $exists: false } },
            { machineNumber: null },
            { machineNumber: '' },
          ],
        },
      },
      {
        $lookup: {
          from: 'productConfigs',
          localField: 'productConfigId',
          foreignField: '_id',
          as: 'pc',
        },
      },
      { $unwind: '$pc' },
      {
        $project: {
          _id: 1,
          // Only emit if the order field is blank AND product has a value.
          setFabric: {
            $cond: [
              {
                $and: [
                  { $or: [{ $eq: ['$fabricType', null] }, { $eq: ['$fabricType', ''] }, { $eq: [{ $type: '$fabricType' }, 'missing'] }] },
                  { $ne: [{ $ifNull: ['$pc.fabricType', ''] }, ''] },
                ],
              },
              '$pc.fabricType',
              null,
            ],
          },
          setTool: {
            $cond: [
              {
                $and: [
                  { $or: [{ $eq: ['$toolResult', null] }, { $eq: ['$toolResult', ''] }, { $eq: [{ $type: '$toolResult' }, 'missing'] }] },
                  { $ne: [{ $ifNull: ['$pc.toolResult', ''] }, ''] },
                ],
              },
              '$pc.toolResult',
              null,
            ],
          },
          setMachineNumber: {
            $cond: [
              {
                $and: [
                  { $or: [{ $eq: ['$machineNumber', null] }, { $eq: ['$machineNumber', ''] }, { $eq: [{ $type: '$machineNumber' }, 'missing'] }] },
                  { $ne: [{ $ifNull: ['$pc.machineNumber', ''] }, ''] },
                ],
              },
              '$pc.machineNumber',
              null,
            ],
          },
        },
      },
      {
        $match: {
          $or: [
            { setFabric: { $ne: null } },
            { setTool: { $ne: null } },
            { setMachineNumber: { $ne: null } },
          ],
        },
      },
    ]);

    let updated = 0;
    for (const r of rows) {
      const patch: Record<string, unknown> = {};
      if (r.setFabric) patch.fabricType = r.setFabric;
      if (r.setTool) patch.toolResult = r.setTool;
      if (r.setMachineNumber) patch.machineNumber = r.setMachineNumber;
      if (Object.keys(patch).length === 0) continue;
      await this.orderModel.updateOne({ _id: r._id }, { $set: patch });
      updated++;
    }
    void this.invalidateListCache();
    return { scanned: rows.length, updated };
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
    if (dto.field === 'assignee') {
      await this.assertAssigneeUserValid(dto.value);
    } else {
      await this.assertValueAllowed(dto.field, dto.value);
    }

    const before = await this.orderRepository.findOneById(id);
    if (!before) throw new NotFoundException('Order not found');

    const normalized = dto.value === '' ? null : dto.value;
    const patch: Record<string, unknown> = { [dto.field]: normalized };

    if (dto.field === 'toolResultNote') {
      patch.readyForFulfill = normalized === READY_FOR_FULFILL_CODE;
      // Khi xưởng đánh 'ok' → đơn hết lỗi → rời tab "Nhật ký bù lỗi".
      if (normalized === READY_FOR_FULFILL_CODE) {
        patch.productionFirstErrorAt = null;
      }
    }

    // ─── Designer-Task-Workflow Phase 3 hooks ──────────────────────
    // 1) assignee → auto-set designerStatus + timestamps, block reassign khi
    //    đang in-progress/done/rework.
    if (dto.field === 'assignee') {
      const currentDesignerStatus =
        ((before as unknown as { designerStatus?: DesignerStatus }).designerStatus) ||
        DesignerStatus.Unassigned;
      if (!DESIGNER_REASSIGNABLE_STATUSES.includes(currentDesignerStatus)) {
        throw new ConflictException(
          `Không reassign được — task đang '${currentDesignerStatus}'. Yêu cầu designer hoàn thành hoặc reset trước.`,
        );
      }
      if (normalized) {
        patch.designerStatus = DesignerStatus.Assigned;
        patch.designerAssignedAt = new Date();
        // Clear reject reason khi assign lại (kể cả cùng người), tránh để rác
        // từ vòng reject trước.
        patch.designerRejectedReason = null;
        patch.designerRejectedAt = null;
      } else {
        // Clear assignee → trở về unassigned + xoá tất cả timestamps designer.
        patch.designerStatus = DesignerStatus.Unassigned;
        patch.designerAssignedAt = null;
        patch.designerStartedAt = null;
        patch.designerCompletedAt = null;
        patch.designerRejectedAt = null;
        patch.designerReworkAt = null;
        patch.designerRejectedReason = null;
        patch.designerReworkCount = 0;
      }
    }

    // 2) productionError → auto-fill productionErrorSource từ config (user
    //    override sau qua updateField('productionErrorSource')). Đồng thời:
    //    - Set toolResultNote='error' để xưởng nhìn thấy ngay (đếm số lần
    //      qua productionErrorCount để cell hiển thị "Lỗi ×N")
    //    - readyForFulfill GIỮ NGUYÊN (= true) để fulfillment vẫn thấy đơn
    //      lỗi trong list mặc định, không cần switch filter
    //    - Nếu source='designer' VÀ task đang done → auto rework.
    let autoReworkApplied = false;
    let incProductionErrorCount = false;
    if (dto.field === 'productionError') {
      if (normalized) {
        const cfg = await this.workshopConfigRepository.findOne({
          category: WorkshopConfigCategory.ProductionError,
          code: normalized,
        });
        const errorSource = (cfg as unknown as { errorSource?: string } | null)?.errorSource;
        if (errorSource === 'designer' || errorSource === 'factory') {
          patch.productionErrorSource = errorSource;
        }
        // Set toolResultNote='error' + bump counter — signal cho fulfillment.
        patch.toolResultNote = 'error';
        patch.readyForFulfill = false;
        incProductionErrorCount = true;
        // Set productionFirstErrorAt CHỈ khi field chưa có giá trị (vào lỗi
        // lần đầu của cycle hiện tại). Các lần báo lỗi tiếp theo trong cùng
        // cycle KHÔNG reset — cycle mới chỉ sau khi đơn rời log (toolResultNote='ok'
        // hoặc productionError=null) → field bị clear → lần lỗi kế tiếp set lại.
        const beforeFirstErrorAt =
          (before as unknown as { productionFirstErrorAt?: Date }).productionFirstErrorAt;
        if (!beforeFirstErrorAt) patch.productionFirstErrorAt = new Date();
        const currentDesignerStatus =
          ((before as unknown as { designerStatus?: DesignerStatus }).designerStatus) ||
          DesignerStatus.Unassigned;
        if (errorSource === 'designer' && currentDesignerStatus === DesignerStatus.Done) {
          patch.designerStatus = DesignerStatus.Rework;
          patch.designerReworkAt = new Date();
          autoReworkApplied = true;
        }
      } else {
        // Clear productionError → cũng clear source. Counter giữ nguyên
        // (lịch sử) — toolResultNote giữ nguyên để designer chủ động chỉnh.
        // Đơn rời nhật ký bù lỗi → clear productionFirstErrorAt.
        patch.productionErrorSource = null;
        patch.productionFirstErrorAt = null;
      }
    }

    // 3) productionErrorSource user manually set → cũng có thể trigger rework
    //    nếu user đổi từ 'factory' → 'designer' và task đang done.
    if (dto.field === 'productionErrorSource' && normalized === 'designer') {
      const currentDesignerStatus =
        ((before as unknown as { designerStatus?: DesignerStatus }).designerStatus) ||
        DesignerStatus.Unassigned;
      if (currentDesignerStatus === DesignerStatus.Done) {
        patch.designerStatus = DesignerStatus.Rework;
        patch.designerReworkAt = new Date();
        autoReworkApplied = true;
      }
    }

    // Tách $inc / $set vì autoReworkApplied cần $inc.
    const mongoUpdate: Record<string, unknown> = { $set: patch };
    const incOps: Record<string, number> = {};
    if (autoReworkApplied) incOps.designerReworkCount = 1;
    if (incProductionErrorCount) incOps.productionErrorCount = 1;
    if (Object.keys(incOps).length > 0) mongoUpdate.$inc = incOps;

    const updated = await this.orderModel.findOneAndUpdate({ _id: id }, mongoUpdate, { new: true });
    if (!updated) throw new NotFoundException('Order not found');

    void this.orderLogService.write({
      orderId: id,
      action: 'update',
      field: dto.field,
      before: (before as unknown as Record<string, unknown>)[dto.field] ?? null,
      after: normalized,
      ctx,
    });

    if (autoReworkApplied) {
      void this.orderLogService.write({
        orderId: id,
        action: 'update',
        field: 'designerStatus',
        before: DesignerStatus.Done,
        after: DesignerStatus.Rework,
        ctx,
      });
    }

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
    if (dto.field === 'assignee') {
      await this.assertAssigneeUserValid(dto.value);
    } else {
      await this.assertValueAllowed(dto.field, dto.value);
    }

    const normalized = dto.value === '' ? null : dto.value;
    const patch: Record<string, unknown> = { [dto.field]: normalized };
    if (dto.field === 'toolResultNote') {
      patch.readyForFulfill = normalized === READY_FOR_FULFILL_CODE;
      if (normalized === READY_FOR_FULFILL_CODE) {
        patch.productionFirstErrorAt = null;
      }
    }

    // Bulk assignee → mirror updateField: chỉ assign cho order ở trạng thái
    // reassignable; orders đang in-progress/done/rework sẽ KHÔNG match filter
    // và returned matchedCount thấp hơn ids.length để FE biết phần nào bị bỏ.
    let extraMatchFilter: Record<string, unknown> | null = null;
    if (dto.field === 'assignee') {
      if (normalized) {
        patch.designerStatus = 'assigned';
        patch.designerAssignedAt = new Date();
        patch.designerRejectedReason = null;
        patch.designerRejectedAt = null;
      } else {
        patch.designerStatus = 'unassigned';
        patch.designerAssignedAt = null;
        patch.designerStartedAt = null;
        patch.designerCompletedAt = null;
        patch.designerRejectedAt = null;
        patch.designerReworkAt = null;
        patch.designerRejectedReason = null;
        patch.designerReworkCount = 0;
      }
      extraMatchFilter = {
        $or: [
          { designerStatus: { $exists: false } },
          { designerStatus: { $in: DESIGNER_REASSIGNABLE_STATUSES } },
        ],
      };
    }

    // Snapshot before-values for the audit log. Cheap because we only need the
    // field being changed plus _id.
    const beforeDocs = await this.orderModel
      .find({ _id: { $in: dto.ids }, deletedAt: { $exists: false } }, { _id: 1, [dto.field]: 1 })
      .lean();

    const matchFilter: Record<string, unknown> = {
      _id: { $in: dto.ids },
      deletedAt: { $exists: false },
    };
    if (extraMatchFilter) Object.assign(matchFilter, extraMatchFilter);
    const result = await this.orderModel.updateMany(matchFilter, { $set: patch });

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

  /**
   * Single-order fetch cho detail dialog. Designer (sub) chỉ get được task
   * có `assignee = user._id`. Roles khác (Admin/Leader/...) bypass.
   */
  async getOrderById(
    id: string,
    roleName?: RoleType,
    userId?: string,
  ): Promise<{ success: true; data: unknown }> {
    const doc = await this.orderModel
      .findById(id)
      .populate('factory', 'name shortName')
      .populate('machineType', 'name shortName')
      .populate('productConfig', 'fullName shortName')
      .lean();
    if (!doc) throw new NotFoundException('Order not found');

    if (roleName === RoleType.Designer) {
      if (!userId || (doc as { assignee?: string }).assignee !== userId) {
        throw new ForbiddenException('Task không thuộc bạn.');
      }
    }
    return { success: true, data: doc };
  }

  async getLogs(orderId: string, dto: import('shared').GetOrderLogsDto) {
    return this.orderLogService.listByOrder(orderId, dto);
  }

  /**
   * Split designs into display URLs + original URLs.
   * Returns undefined for empty inputs.
   */
  /**
   * Trả về:
   *   - `designsOriginal` = URL raw user paste (luôn giữ để fallback).
   *   - `designs` = chỉ set khi R2 chưa active (legacy Teehub URL transform).
   *                Khi R2 active, để rỗng — worker BullMQ sẽ ghi sau khi
   *                download/encode/upload xong.
   *   - `designsStatus` = `'pending'` cho mọi field có URL khi R2 active.
   *   - `designJobs[]` = list job cần enqueue (caller gọi addBulk).
   */
  private processDesigns(
    input?: DesignFields,
    ctx?: string,
  ): {
    designs?: DesignFields;
    designsOriginal?: DesignFields;
    designsStatus?: Record<string, 'pending'>;
    designJobs: Array<{ designKey: string; sourceUrl: string }>;
  } {
    if (!input) return { designJobs: [] };
    const original: DesignFields = {};
    const designsStatus: Record<string, 'pending'> = {};
    const designJobs: Array<{ designKey: string; sourceUrl: string }> = [];
    const r2Enabled = this.designImageService.isEnabled();
    const displayLegacy: DesignFields = {};
    let hasAny = false;
    for (const [k, v] of Object.entries(input)) {
      if (!v || typeof v !== 'string' || !v.trim()) continue;
      const raw = v.trim();
      original[k as keyof DesignFields] = raw;
      hasAny = true;
      if (r2Enabled) {
        designsStatus[k] = 'pending';
        designJobs.push({ designKey: k, sourceUrl: raw });
      } else {
        // Fallback path: dùng transform Teehub cũ tránh ảnh hỏng khi chưa
        // cấu hình R2.
        const { url } = processImageUrl(raw, { keepOriginal: true });
        if (url !== raw) {
          // eslint-disable-next-line no-console
          console.log(`[transform-legacy] ${ctx ?? ''} designs.${k}: ${raw} → ${url}`);
        }
        displayLegacy[k as keyof DesignFields] = url;
      }
    }
    if (!hasAny) return { designJobs: [] };
    return {
      designs: r2Enabled ? undefined : displayLegacy,
      designsOriginal: original,
      designsStatus: r2Enabled ? designsStatus : undefined,
      designJobs,
    };
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
    const startedAt = new Date();
    const skipped: Array<{ row: number; reason: string }> = [];
    let imported = 0;
    let updated = 0;
    let mapped = 0;
    let unmapped = 0;
    const factoryCount = new Map<string, number>();
    let unassignedFactoryCount = 0;
    const logRows: Array<{
      orderId: string;
      action: 'create' | 'update';
      after: Record<string, unknown>;
    }> = [];
    /**
     * Dedup theo `${designKey}::${sourceUrl}` → 2 đơn cùng design URL chỉ enqueue 1 job.
     * Worker sẽ updateMany cho cả 2 sau khi xử lý xong.
     */
    const designJobMap = new Map<
      string,
      { designKey: string; sourceUrl: string; orderIds: Set<string> }
    >();

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
        let toolResult: string | undefined;
        let machineNumber: string | undefined;

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
            toolResult = pc.toolResult || undefined;
            machineNumber = pc.machineNumber || undefined;
            mapped++;
          } else {
            unmapped++;
          }
        } else {
          unmapped++;
        }

        if (factoryId) {
          factoryCount.set(factoryId, (factoryCount.get(factoryId) ?? 0) + 1);
        } else {
          unassignedFactoryCount++;
        }

        const { designJobs, ...designData } = this.processDesigns(row.designs, row.productionId);

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
          ...designData,
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
        };
        // Insert-only fields: fabric + toolResult + machineNumber are *defaults*
        // derived from product config. If the workshop already overrode them on
        // a previous run, re-import shouldn't blow those edits away.
        // `originalFactoryId` is pinned for the same reason.
        const insertOnly: Record<string, unknown> = { originalFactoryId: factoryId };
        if (fabricType) insertOnly.fabricType = fabricType;
        if (toolResult) insertOnly.toolResult = toolResult;
        if (machineNumber) insertOnly.machineNumber = machineNumber;

        // Atomic upsert by productionId — includes soft-deleted records
        const existed = await this.orderModel.exists({ productionId: data.productionId });
        const upserted = await this.orderModel.findOneAndUpdate(
          { productionId: data.productionId },
          { $set: data, $setOnInsert: { createdAt: new Date(), ...insertOnly } },
          { upsert: true, new: true },
        );
        if (existed) {
          updated++;
        } else {
          imported++;
        }
        if (upserted?._id) {
          const orderIdStr = String(upserted._id);
          // Gom design job sau khi đã có orderId thật. Dedup theo
          // (designKey, sourceUrl) — 2 đơn cùng URL chỉ tạo 1 job, worker
          // updateMany cho cả 2.
          for (const job of designJobs) {
            const key = `${job.designKey}::${job.sourceUrl}`;
            let entry = designJobMap.get(key);
            if (!entry) {
              entry = { designKey: job.designKey, sourceUrl: job.sourceUrl, orderIds: new Set() };
              designJobMap.set(key, entry);
            }
            entry.orderIds.add(orderIdStr);
          }
          logRows.push({
            orderId: orderIdStr,
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

    // Enqueue design image jobs sau khi import xong — fire-and-forget vì
    // user không cần đợi worker xong mới thấy response. Khi R2 chưa active,
    // designJobMap luôn rỗng.
    if (designJobMap.size > 0) {
      const jobs = Array.from(designJobMap.values()).map((entry) => ({
        name: `import-${entry.designKey}`,
        data: {
          sourceUrl: entry.sourceUrl,
          orderIds: Array.from(entry.orderIds),
          designKey: entry.designKey,
        } satisfies DesignImageJobData,
      }));
      void this.designQueue.addBulk(jobs).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[design-image] addBulk failed (${jobs.length} jobs):`, err);
      });
    }

    void this.sendImportSummaryNotification({
      factoryCount,
      unassignedFactoryCount,
      imported,
      updated,
      skippedCount: skipped.length,
      startedAt,
      ctx,
    });

    return { success: true, data: { imported, updated, mapped, unmapped, skipped } };
  }

  private async sendImportSummaryNotification(args: {
    factoryCount: Map<string, number>;
    unassignedFactoryCount: number;
    imported: number;
    updated: number;
    skippedCount: number;
    startedAt: Date;
    ctx?: AuditContext;
  }): Promise<void> {
    try {
      const ids = [...args.factoryCount.keys()];
      const factories = ids.length > 0 ? await this.factoryRepository.findAll({ _id: { $in: ids } }) : [];
      const nameById = new Map(factories.map((f) => [String(f._id), f.name]));

      const byFactory = ids.map((id) => ({
        name: nameById.get(id) ?? `#${id.slice(-6)}`,
        count: args.factoryCount.get(id) ?? 0,
      }));

      await this.telegramNotificationService.notifyImportSummary({
        triggeredBy: args.ctx?.user
          ? { email: args.ctx.user.email, fullName: args.ctx.user.fullName }
          : undefined,
        totals: { imported: args.imported, updated: args.updated, skipped: args.skippedCount },
        byFactory,
        unassignedFactoryCount: args.unassignedFactoryCount,
        startedAt: args.startedAt,
        finishedAt: new Date(),
      });
    } catch (error) {
      this.logger.warn({
        message: '[order.import] telegram notification failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Pre-flight check cho bulk assign designer — không update DB, trả stats
   * để FE confirm. Đếm theo `designerStatus` hiện tại và group đơn đã gán
   * cho ai.
   */
  async bulkAssignDesignerPreview(
    dto: BulkAssignDesignerPreviewDto,
  ): Promise<BulkAssignDesignerPreviewResDto> {
    const docs = await this.orderModel
      .find(
        { _id: { $in: dto.ids } },
        { _id: 1, productionId: 1, assignee: 1, designerStatus: 1 },
      )
      .lean();

    const byStatus = {
      unassigned: 0,
      assigned: 0,
      inProgress: 0,
      done: 0,
      rejected: 0,
      rework: 0,
    };
    const assigneeCounts = new Map<string, number>();
    let blocked = 0;
    let eligible = 0;

    for (const o of docs) {
      const status =
        ((o as { designerStatus?: DesignerStatus }).designerStatus as DesignerStatus) ||
        DesignerStatus.Unassigned;
      switch (status) {
        case DesignerStatus.Unassigned:
          byStatus.unassigned++;
          break;
        case DesignerStatus.Assigned:
          byStatus.assigned++;
          break;
        case DesignerStatus.InProgress:
          byStatus.inProgress++;
          break;
        case DesignerStatus.Done:
          byStatus.done++;
          break;
        case DesignerStatus.Rejected:
          byStatus.rejected++;
          break;
        case DesignerStatus.Rework:
          byStatus.rework++;
          break;
      }
      if (DESIGNER_REASSIGNABLE_STATUSES.includes(status)) {
        eligible++;
      } else {
        blocked++;
      }
      const a = (o as { assignee?: string }).assignee;
      if (a) assigneeCounts.set(a, (assigneeCounts.get(a) || 0) + 1);
    }

    // Resolve fullName từ users collection.
    const userIds = [...assigneeCounts.keys()];
    const nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const users = await this.userModel
        .find({ _id: { $in: userIds } }, { _id: 1, fullName: 1 })
        .lean();
      for (const u of users) {
        nameMap.set(String(u._id), u.fullName);
      }
    }

    const alreadyAssigned = [...assigneeCounts.entries()]
      .map(([userId, count]) => ({
        userId,
        fullName: nameMap.get(userId),
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      success: true,
      data: {
        total: docs.length,
        byStatus,
        alreadyAssigned,
        blockedCount: blocked,
        eligibleCount: eligible,
      },
    };
  }

  /**
   * Apply bulk assign designer. Skip orders đang in-progress/done/rework +
   * trả về detail list để FE thông báo. Khi `reassignOthers=false`, BE thêm
   * skip cho đơn đã assign cho người khác (FE confirm rồi gửi true).
   */
  async bulkAssignDesigner(
    dto: BulkAssignDesignerDto,
    roleName?: RoleType,
    ctx?: AuditContext,
  ): Promise<BulkAssignDesignerResDto> {
    this.assertCanEditField('assignee', roleName);
    await this.assertAssigneeUserValid(dto.userId);

    const docs = await this.orderModel
      .find(
        { _id: { $in: dto.ids }, deletedAt: { $exists: false } },
        { _id: 1, productionId: 1, assignee: 1, designerStatus: 1 },
      )
      .lean();

    const skipped: { orderId: string; productionId: string; reason: string }[] = [];
    const eligibleIds: string[] = [];

    for (const o of docs) {
      const orderId = String(o._id);
      const productionId = String((o as { productionId?: string }).productionId || orderId);
      const status =
        ((o as { designerStatus?: DesignerStatus }).designerStatus as DesignerStatus) ||
        DesignerStatus.Unassigned;
      const currentAssignee = (o as { assignee?: string }).assignee;

      if (!DESIGNER_REASSIGNABLE_STATUSES.includes(status)) {
        skipped.push({
          orderId,
          productionId,
          reason: `Đang '${status}' — không thể reassign. Yêu cầu designer hoàn thành trước.`,
        });
        continue;
      }
      if (
        currentAssignee &&
        currentAssignee !== dto.userId &&
        !dto.reassignOthers
      ) {
        skipped.push({
          orderId,
          productionId,
          reason: `Đã gán cho designer khác — bật "Ghi đè" nếu muốn assign lại.`,
        });
        continue;
      }
      eligibleIds.push(orderId);
    }

    let modified = 0;
    if (eligibleIds.length > 0) {
      const patch: Record<string, unknown> = {
        assignee: dto.userId,
        designerStatus: DesignerStatus.Assigned,
        designerAssignedAt: new Date(),
        designerRejectedReason: null,
        designerRejectedAt: null,
      };
      const result = await this.orderModel.updateMany(
        { _id: { $in: eligibleIds } },
        { $set: patch },
      );
      modified = result.modifiedCount || 0;

      void this.orderLogService.writeMany(
        eligibleIds.map((orderId) => ({
          orderId,
          action: 'bulk_update' as const,
          field: 'assignee',
          before: null,
          after: dto.userId,
          ctx,
        })),
      );

      void this.invalidateListCache();
    }

    return {
      success: true,
      data: {
        matched: docs.length,
        modified,
        skipped,
      },
    };
  }

  /**
   * Designer breakdown summary cho trang /orders (Admin/Leader). Trả về:
   *   - `scoped`: KPI count theo filter hiện tại
   *   - `overall`: KPI count toàn bộ (ignore filter) — dùng làm baseline
   *   - `perDesigner`: matrix mỗi user × 6 status (chỉ trong scope filter)
   *
   * Sub-designer KHÔNG được gọi endpoint này (auth ở controller).
   */
  async getDesignerBreakdown(
    dto: GetProductionOrdersDto,
    roleName?: RoleType,
    fulfillmentFactoryId?: string,
  ): Promise<DesignerBreakdownResDto> {
    // Scoped match — áp đầy đủ filter của list.
    const scopedFilter = this.buildOrderListFilter(dto, roleName, undefined, fulfillmentFactoryId);
    // Overall match — bỏ tất cả workshop filter, giữ visibility (date) cho nhất quán.
    const overallFilter = this.buildVisibilityFilter(
      roleName,
      { createdFrom: dto.createdFrom, createdTo: dto.createdTo } as GetProductionOrdersDto,
      undefined,
      fulfillmentFactoryId,
    );

    const countByStatus = async (match: Record<string, unknown>): Promise<DesignerStatusCounts> => {
      const agg = await this.orderModel.aggregate<{ _id: string | null; count: number }>([
        { $match: match },
        {
          $group: {
            _id: { $ifNull: ['$designerStatus', 'unassigned'] },
            count: { $sum: 1 },
          },
        },
      ]);
      const out: DesignerStatusCounts = {
        unassigned: 0,
        assigned: 0,
        inProgress: 0,
        done: 0,
        rejected: 0,
        rework: 0,
        total: 0,
      };
      for (const r of agg) {
        const k = (r._id || 'unassigned') as string;
        switch (k) {
          case 'unassigned':
            out.unassigned += r.count;
            break;
          case 'assigned':
            out.assigned += r.count;
            break;
          case 'in-progress':
            out.inProgress += r.count;
            break;
          case 'done':
            out.done += r.count;
            break;
          case 'rejected':
            out.rejected += r.count;
            break;
          case 'rework':
            out.rework += r.count;
            break;
        }
        out.total += r.count;
      }
      return out;
    };

    const [scoped, overall] = await Promise.all([
      countByStatus(scopedFilter),
      countByStatus(overallFilter),
    ]);

    // Per-designer matrix — group (assignee, designerStatus) trong scope filter.
    const matrixAgg = await this.orderModel.aggregate<{
      _id: { uid: string | null; status: string | null };
      count: number;
    }>([
      { $match: scopedFilter },
      {
        $group: {
          _id: {
            uid: { $ifNull: ['$assignee', null] },
            status: { $ifNull: ['$designerStatus', 'unassigned'] },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Auto-include designer users (role=Designer) chưa có task nào → row count 0.
    const designerRole = await this.roleRepository.findOne({ name: RoleType.Designer });
    const teamUsers = designerRole
      ? await this.userModel
          .find({ roleId: designerRole._id }, { _id: 1, fullName: 1, email: 1 })
          .lean()
      : [];

    const userIds = new Set<string>();
    let hasUnassigned = false;
    for (const r of matrixAgg) {
      if (r._id.uid) userIds.add(r._id.uid);
      else hasUnassigned = true;
    }
    for (const u of teamUsers) userIds.add(String(u._id));

    const userMap = new Map<string, { fullName: string; email?: string }>();
    for (const u of teamUsers) userMap.set(String(u._id), { fullName: u.fullName, email: u.email });

    const blankCounts = (): DesignerStatusCounts => ({
      unassigned: 0,
      assigned: 0,
      inProgress: 0,
      done: 0,
      rejected: 0,
      rework: 0,
      total: 0,
    });

    const rows = new Map<
      string,
      { userId: string; fullName: string; email?: string; counts: DesignerStatusCounts }
    >();
    for (const uid of userIds) {
      const u = userMap.get(uid);
      rows.set(uid, {
        userId: uid,
        fullName: u?.fullName || `#${uid.slice(-4)}`,
        email: u?.email,
        counts: blankCounts(),
      });
    }
    if (hasUnassigned) {
      rows.set('__unassigned__', {
        userId: '__unassigned__',
        fullName: 'Chưa gán',
        counts: blankCounts(),
      });
    }

    for (const r of matrixAgg) {
      const key = r._id.uid || '__unassigned__';
      const row = rows.get(key);
      if (!row) continue;
      const s = r._id.status || 'unassigned';
      row.counts.total += r.count;
      switch (s) {
        case 'unassigned':
          row.counts.unassigned += r.count;
          break;
        case 'assigned':
          row.counts.assigned += r.count;
          break;
        case 'in-progress':
          row.counts.inProgress += r.count;
          break;
        case 'done':
          row.counts.done += r.count;
          break;
        case 'rejected':
          row.counts.rejected += r.count;
          break;
        case 'rework':
          row.counts.rework += r.count;
          break;
      }
    }

    const perDesigner = [...rows.values()].sort((a, b) => b.counts.total - a.counts.total);

    return {
      success: true,
      data: { scoped, overall, perDesigner },
    };
  }

  /**
   * Atomic set 3 field productionError + productionErrorSource + productionErrorNote.
   * Cần thiết khi user chọn code "Lỗi khác" → bắt buộc source + note để stats
   * phân loại chính xác và xưởng ghi rõ chi tiết. Auto-fill source từ config
   * nếu user không truyền (cho code có flag rõ).
   */
  async setProductionError(
    id: string,
    dto: SetProductionErrorDto,
    roleName?: RoleType,
    ctx?: AuditContext,
  ): Promise<SetProductionErrorResDto> {
    this.assertCanEditField('productionError', roleName);
    const before = await this.orderRepository.findOneById(id);
    if (!before) throw new NotFoundException('Order not found');

    let finalSource = dto.source;
    if (dto.code) {
      // Validate code tồn tại
      const cfg = await this.workshopConfigRepository.findOne({
        category: WorkshopConfigCategory.ProductionError,
        code: dto.code,
      });
      if (!cfg) throw new BadRequestException(`Invalid productionError code: ${dto.code}`);
      const cfgSource = (cfg as unknown as { errorSource?: 'designer' | 'factory' } | null)?.errorSource;

      // 'other' code → bắt buộc user pick source + note (BE defense).
      if (dto.code === 'other') {
        if (!finalSource) {
          throw new BadRequestException('Code "Lỗi khác" bắt buộc chọn lỗi do designer hay do xưởng.');
        }
        if (!dto.note || !dto.note.trim()) {
          throw new BadRequestException('Code "Lỗi khác" bắt buộc nhập mô tả lỗi.');
        }
      } else {
        // Auto-fill source từ config nếu user không pass.
        if (!finalSource && cfgSource) finalSource = cfgSource;
      }
    } else {
      // Clear hẳn lỗi.
      finalSource = undefined;
    }

    const patch: Record<string, unknown> = {
      productionError: dto.code,
      productionErrorSource: finalSource ?? null,
      productionErrorNote: dto.note ?? null,
    };

    // Khi set code mới (non-null) → toolResultNote='error' cho xưởng nhìn thấy
    // ngay + bump counter. Clear (code=null) → giữ nguyên toolResultNote.
    let incProductionErrorCount = false;
    if (dto.code) {
      patch.toolResultNote = 'error';
      patch.readyForFulfill = false;
      incProductionErrorCount = true;
      const beforeFirstErrorAt =
        (before as unknown as { productionFirstErrorAt?: Date }).productionFirstErrorAt;
      if (!beforeFirstErrorAt) patch.productionFirstErrorAt = new Date();
    } else {
      // Clear lỗi → đơn rời nhật ký bù lỗi.
      patch.productionFirstErrorAt = null;
    }

    // Auto-rework nếu source='designer' và task đang done.
    let autoReworkApplied = false;
    if (finalSource === 'designer') {
      const currentDesignerStatus =
        ((before as unknown as { designerStatus?: DesignerStatus }).designerStatus) ||
        DesignerStatus.Unassigned;
      if (currentDesignerStatus === DesignerStatus.Done) {
        patch.designerStatus = DesignerStatus.Rework;
        patch.designerReworkAt = new Date();
        autoReworkApplied = true;
      }
    }

    const mongoUpdate: Record<string, unknown> = { $set: patch };
    const incOps: Record<string, number> = {};
    if (autoReworkApplied) incOps.designerReworkCount = 1;
    if (incProductionErrorCount) incOps.productionErrorCount = 1;
    if (Object.keys(incOps).length > 0) mongoUpdate.$inc = incOps;

    const updated = await this.orderModel.findOneAndUpdate({ _id: id }, mongoUpdate, { new: true });
    if (!updated) throw new NotFoundException('Order not found');

    void this.orderLogService.writeMany([
      {
        orderId: id,
        action: 'update',
        field: 'productionError',
        before: (before as unknown as Record<string, unknown>).productionError ?? null,
        after: dto.code,
        ctx,
      },
      {
        orderId: id,
        action: 'update',
        field: 'productionErrorSource',
        before: (before as unknown as Record<string, unknown>).productionErrorSource ?? null,
        after: finalSource ?? null,
        ctx,
      },
      {
        orderId: id,
        action: 'update',
        field: 'productionErrorNote',
        before: (before as unknown as Record<string, unknown>).productionErrorNote ?? null,
        after: dto.note ?? null,
        ctx,
      },
    ]);

    void this.invalidateListCache();
    return { success: true, data: updated };
  }

  /**
   * Tab "Nhật ký bù lỗi" — danh sách đơn đang ở trạng thái lỗi xưởng
   * (productionError set, toolResultNote chưa 'ok'). Sort theo
   * `productionFirstErrorAt` ASC để đơn nằm lâu nhất hiện đầu tiên.
   *
   * Visibility: cùng quy tắc như list orders.
   *   - Designer chỉ thấy đơn assignee = userId
   *   - Fulfillment chỉ thấy đơn factory của mình
   *   - Admin/Manager/DesignerLeader thấy hết
   *
   * `byUrgency` tính trên TOÀN bộ scope (bỏ qua pagination) để FE hiện badge
   * count theo mức độ khẩn.
   */
  async getErrorLog(
    dto: GetErrorLogDto,
    roleName?: RoleType,
    assigneeUserId?: string,
    fulfillmentFactoryId?: string,
  ): Promise<GetErrorLogResDto> {
    const filter: Record<string, unknown> = {};
    filter.productionError = { $exists: true, $nin: [null, ''] };
    filter.productionFirstErrorAt = { $exists: true, $ne: null };
    filter.deletedAt = { $exists: false };

    if (roleName === RoleType.Designer) {
      filter.assignee = assigneeUserId || '__no_user__';
    } else if (roleName === RoleType.Fulfillment) {
      if (fulfillmentFactoryId) {
        filter.$or = [
          { factoryId: fulfillmentFactoryId },
          { originalFactoryId: fulfillmentFactoryId },
        ];
      } else {
        filter.factoryId = '__no_factory__';
      }
    }

    if (dto.search) {
      const search = { $regex: dto.search, $options: 'i' };
      const searchOr: Array<Record<string, unknown>> = [
        { productionId: search },
        { userSku: search },
        { userEmail: search },
        { orderId: search },
        { type: search },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    if (dto.assignee) {
      const codes = dto.assignee.split(',').filter(Boolean);
      const hasNone = codes.includes('__none__');
      const real = codes.filter((c) => c !== '__none__');
      if (hasNone && real.length === 0) {
        filter.assignee = { $in: [null, ''] };
      } else if (hasNone) {
        const assigneeOr = [{ assignee: { $in: [null, ''] } }, { assignee: { $in: real } }];
        if (filter.$and) {
          (filter.$and as Array<unknown>).push({ $or: assigneeOr });
        } else if (filter.$or) {
          filter.$and = [{ $or: filter.$or }, { $or: assigneeOr }];
          delete filter.$or;
        } else {
          filter.$or = assigneeOr;
        }
      } else {
        filter.assignee = { $in: real };
      }
    }
    if (dto.fabricType) {
      filter.fabricType = { $in: dto.fabricType.split(',').filter(Boolean) };
    }
    if (dto.toolResult) {
      filter.toolResult = { $in: dto.toolResult.split(',').filter(Boolean) };
    }
    if (dto.productionError) {
      filter.productionError = {
        $in: dto.productionError.split(',').filter(Boolean),
      };
    }
    if (dto.productionErrorSource) {
      const sources = dto.productionErrorSource
        .split(',')
        .filter((s) => s === 'designer' || s === 'factory');
      if (sources.length) filter.productionErrorSource = { $in: sources };
    }
    if (dto.factoryId && roleName !== RoleType.Fulfillment) {
      filter.factoryId = { $in: dto.factoryId.split(',').filter(Boolean) };
    }

    // Urgency filter — compute date thresholds.
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    if (dto.urgency) {
      const levels = dto.urgency.split(',').filter(Boolean);
      const ranges: Array<{ $gt?: Date; $lte?: Date }> = [];
      for (const lvl of levels) {
        if (lvl === 'new') {
          ranges.push({ $gt: new Date(now - 1 * DAY) });
        } else if (lvl === 'attention') {
          ranges.push({ $gt: new Date(now - 2 * DAY), $lte: new Date(now - 1 * DAY) });
        } else if (lvl === 'urgent') {
          ranges.push({ $gt: new Date(now - 3 * DAY), $lte: new Date(now - 2 * DAY) });
        } else if (lvl === 'critical') {
          ranges.push({ $lte: new Date(now - 3 * DAY) });
        }
      }
      if (ranges.length === 1) {
        filter.productionFirstErrorAt = { ...(filter.productionFirstErrorAt as object), ...ranges[0] };
      } else if (ranges.length > 1) {
        const urgencyOr = ranges.map((r) => ({ productionFirstErrorAt: r }));
        if (filter.$and) {
          (filter.$and as Array<unknown>).push({ $or: urgencyOr });
        } else if (filter.$or) {
          filter.$and = [{ $or: filter.$or }, { $or: urgencyOr }];
          delete filter.$or;
        } else {
          filter.$or = urgencyOr;
        }
      }
    }

    const { page, limit } = dto;
    const skip = limit * ((page || 1) - 1);

    // Aggregate by urgency in parallel with the page query. Use same filter
    // MINUS the urgency clause so badge counts reflect "if user expanded
    // selection" (sticky filters).
    const countFilter: Record<string, unknown> = { ...filter };
    delete countFilter.productionFirstErrorAt;
    countFilter.productionFirstErrorAt = { $exists: true, $ne: null };
    // Remove urgency-driven $and clause if any.
    if (Array.isArray(countFilter.$and)) {
      countFilter.$and = (countFilter.$and as Array<{ $or?: unknown[] }>).filter((c) => {
        const or = c.$or as Array<Record<string, unknown>> | undefined;
        if (!or) return true;
        return !or.every((x) => x.productionFirstErrorAt !== undefined);
      });
      if ((countFilter.$and as unknown[]).length === 0) delete countFilter.$and;
    }

    const [pageRes, urgencyAgg] = await Promise.all([
      this.orderRepository.findAllAndCount(filter, {
        paging: { skip, limit },
        sort: { productionFirstErrorAt: 1 },
        populate: [
          { path: 'factory', select: ['name', 'shortName'] },
          { path: 'machineType', select: ['name', 'shortName'] },
        ],
      }),
      this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: countFilter },
        {
          $project: {
            ageMs: { $subtract: [new Date(), '$productionFirstErrorAt'] },
          },
        },
        {
          $project: {
            bucket: {
              $switch: {
                branches: [
                  { case: { $lt: ['$ageMs', DAY] }, then: 'new' },
                  { case: { $lt: ['$ageMs', 2 * DAY] }, then: 'attention' },
                  { case: { $lt: ['$ageMs', 3 * DAY] }, then: 'urgent' },
                ],
                default: 'critical',
              },
            },
          },
        },
        { $group: { _id: '$bucket', count: { $sum: 1 } } },
      ]),
    ]);

    const byUrgency = { new: 0, attention: 0, urgent: 0, critical: 0 };
    for (const row of urgencyAgg) {
      if (row._id === 'new' || row._id === 'attention' || row._id === 'urgent' || row._id === 'critical') {
        byUrgency[row._id] = row.count;
      }
    }

    return { success: true, data: pageRes.data, total: pageRes.total, byUrgency };
  }

  /**
   * Backfill `designerStatus` + 5 timestamps cho order cũ. Idempotent —
   * chỉ áp khi order chưa có `designerStatus` (Mongoose default cũng là
   * `unassigned` nhưng default đó áp khi load, không lưu vào doc cũ).
   *
   * Heuristic suy luận:
   *   - assignee không có → 'unassigned'
   *   - có productionError với errorSource='designer' → 'rework'
   *   - toolResultNote === 'ok'                       → 'done'
   *   - còn lại                                       → 'assigned'
   *
   * Timestamps:
   *   - designerAssignedAt = log đầu tiên field='assignee' (sau '' → có code)
   *   - designerCompletedAt = log cuối field='toolResultNote' (chuyển sang 'ok')
   *   - designerReworkAt = log cuối field='productionError' (set khác empty)
   *   - designerStartedAt = midpoint (assignedAt + completedAt)/2 nếu thiếu
   *
   * Trả về `{ scanned, updated, skipped }`.
   */
  async backfillDesignerStatus(): Promise<{
    scanned: number;
    updated: number;
    skipped: number;
  }> {
    // 1) Build map errorCode → errorSource từ workshop_config.
    const errorConfigs = await this.workshopConfigRepository.findAll({
      category: WorkshopConfigCategory.ProductionError,
    });
    const errorSourceMap = new Map<string, string | undefined>();
    for (const cfg of errorConfigs as Array<{ code: string; errorSource?: string }>) {
      errorSourceMap.set(cfg.code, cfg.errorSource);
    }

    // 2) Quét order — chỉ những đơn chưa có `designerStatus` (đảm bảo idempotent).
    const orders = await this.orderModel
      .find({ designerStatus: { $exists: false } })
      .lean();

    let updated = 0;
    let skipped = 0;

    for (const o of orders) {
      const orderId = String(o._id);
      const assignee = (o as { assignee?: string }).assignee;
      const toolResultNote = (o as { toolResultNote?: string }).toolResultNote;
      const productionError = (o as { productionError?: string }).productionError;

      let nextStatus: DesignerStatus = DesignerStatus.Unassigned;
      if (!assignee) {
        nextStatus = DesignerStatus.Unassigned;
      } else if (productionError && errorSourceMap.get(productionError) === 'designer') {
        nextStatus = DesignerStatus.Rework;
      } else if (toolResultNote === READY_FOR_FULFILL_CODE) {
        nextStatus = DesignerStatus.Done;
      } else {
        nextStatus = DesignerStatus.Assigned;
      }

      const patch: Record<string, unknown> = { designerStatus: nextStatus };

      // Look up logs once per order (N+1 — OK cho one-shot backfill).
      const logs = await this.orderLogRepository.findAll(
        { orderId },
        { sort: { createdAt: 1 } },
      );

      const assignLog = logs.find(
        (l) => l.field === 'assignee' && !!l.after,
      );
      const completeLog = [...logs]
        .reverse()
        .find((l) => l.field === 'toolResultNote' && l.after === READY_FOR_FULFILL_CODE);
      const reworkLog = [...logs]
        .reverse()
        .find((l) => l.field === 'productionError' && !!l.after);

      const createdAt = (o as { createdAt?: Date }).createdAt;
      const updatedAt = (o as { updatedAt?: Date }).updatedAt;

      if (nextStatus !== DesignerStatus.Unassigned) {
        patch.designerAssignedAt =
          (assignLog as { createdAt?: Date } | undefined)?.createdAt ?? createdAt;
      }
      if (nextStatus === DesignerStatus.Done || nextStatus === DesignerStatus.Rework) {
        patch.designerCompletedAt =
          (completeLog as { createdAt?: Date } | undefined)?.createdAt ?? updatedAt;
        const assignedAt = patch.designerAssignedAt as Date | undefined;
        const completedAt = patch.designerCompletedAt as Date | undefined;
        if (assignedAt && completedAt && completedAt.getTime() > assignedAt.getTime()) {
          patch.designerStartedAt = new Date(
            assignedAt.getTime() + (completedAt.getTime() - assignedAt.getTime()) / 2,
          );
        } else {
          patch.designerStartedAt = assignedAt;
        }
      }
      if (nextStatus === DesignerStatus.Rework) {
        patch.designerReworkAt =
          (reworkLog as { createdAt?: Date } | undefined)?.createdAt ?? updatedAt;
        patch.designerReworkCount = 1;
      }

      try {
        await this.orderModel.updateOne({ _id: orderId }, { $set: patch });
        updated++;
      } catch (err) {
        skipped++;
        this.logger.warn({
          message: `[backfill-designer] ${orderId} failed: ${
            (err as Error).message
          }`,
        });
      }
    }

    void this.invalidateListCache();
    return { scanned: orders.length, updated, skipped };
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
