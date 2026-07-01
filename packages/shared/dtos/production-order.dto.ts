import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import {
  DesignerStatus,
  DesignerTransitionAction,
  FulfillmentStage,
  FulfillmentStageStatus,
  FulfillmentTransitionAction,
} from '@shared/enums';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { IDZod } from '..';

export const DesignerStatusZod = z.nativeEnum(DesignerStatus);
export const DesignerTransitionActionZod = z.nativeEnum(DesignerTransitionAction);

export const FulfillmentStageZod = z.nativeEnum(FulfillmentStage);
export const FulfillmentStageStatusZod = z.nativeEnum(FulfillmentStageStatus);
export const FulfillmentTransitionActionZod = z.nativeEnum(FulfillmentTransitionAction);

/** State per 1 stage (Print/Press/QC/Sew/Pack). */
export const FulfillmentStageStateZod = z.object({
  status: FulfillmentStageStatusZod.default(FulfillmentStageStatus.Waiting),
  /** = user._id của worker đảm nhiệm (resolved từ factory+stage tại thời điểm assign). */
  assignee: z.string().optional(),
  assignedAt: z.date().optional(),
  /**
   * Thời điểm stage **nhận task** (vào trạng thái `waiting`). Set khi:
   *   - Auto-advance từ stage trước complete.
   *   - Designer.complete entry → set cho `print`.
   *   - Entry B (manual `toolResultNote='ok'`) → set cho `print`.
   * KHÔNG set khi rework-back của reporter (reporter chỉ đẩy đi rồi chờ — không
   * coi như nhận task mới); dùng `reworkAt` cho case quay lại.
   * FE hiển thị "Nhận task lúc..." trong card tab "Đang chờ".
   */
  waitingAt: z.date().optional(),
  /** Start của cycle hiện tại — reset mỗi lần start/restart. */
  startedAt: z.date().optional(),
  /** Start của LẦN ĐẦU — immutable. Dùng tính response time. */
  firstStartedAt: z.date().optional(),
  completedAt: z.date().optional(),
  reworkAt: z.date().optional(),
  /** Số lần stage này bị stage sau đẩy về (hoặc nằm trên đường đẩy về). */
  reworkCount: z.number().int().nonnegative().default(0),
  reworkReason: z.string().max(500).optional(),
  /** Stage đã trigger rework-back đẩy về stage này (vd QC đẩy về In). */
  reworkFromStage: FulfillmentStageZod.optional(),
  /** Cumulative thời gian làm thực (ms) — $inc khi complete. */
  workMs: z.number().int().nonnegative().default(0),
});
export type FulfillmentStageState = z.infer<typeof FulfillmentStageStateZod>;

export const FulfillmentStagesZod = z.object({
  print: FulfillmentStageStateZod.optional(),
  press: FulfillmentStageStateZod.optional(),
  'qc-post-press': FulfillmentStageStateZod.optional(),
  'qc-sorting': FulfillmentStageStateZod.optional(),
  'sew-in': FulfillmentStageStateZod.optional(),
  'sew-out': FulfillmentStageStateZod.optional(),
  pack: FulfillmentStageStateZod.optional(),
});
export type FulfillmentStages = z.infer<typeof FulfillmentStagesZod>;

/** 1 dòng lịch sử di chuyển. Push mỗi lần transition. */
export const FulfillmentTimelineEntryZod = z.object({
  stage: FulfillmentStageZod,
  action: FulfillmentTransitionActionZod,
  fromStatus: FulfillmentStageStatusZod,
  toStatus: FulfillmentStageStatusZod,
  byUserId: IDZod,
  byUserName: z.string().optional(),
  at: z.date(),
  /** Khi action=rework-back: target = designer | <stage>. */
  reworkTarget: z.string().optional(),
  reason: z.string().max(500).optional(),
});
export type FulfillmentTimelineEntry = z.infer<typeof FulfillmentTimelineEntryZod>;

export const DesignFieldsZod = z.object({
  front: z.string().optional(),
  back: z.string().optional(),
  sleeve: z.string().optional(),
  hood: z.string().optional(),
  folder: z.string().optional(),
  placket: z.string().optional(),
  chestLeft: z.string().optional(),
  chestRight: z.string().optional(),
  left: z.string().optional(),
  right: z.string().optional(),
  sleeveLeft: z.string().optional(),
  sleeveRight: z.string().optional(),
  leftUpperSleeve: z.string().optional(),
  rightUpperSleeve: z.string().optional(),
  leftCuff: z.string().optional(),
  rightCuff: z.string().optional(),
  frontEmbroidery: z.string().optional(),
  backEmbroidery: z.string().optional(),
});
export type DesignFields = z.infer<typeof DesignFieldsZod>;

/** Trạng thái pipeline R2 cho từng vị trí design (Phase 6 Design-R2-Pipeline). */
export const DesignStatusZod = z.enum(['pending', 'ready', 'failed']);
export type DesignStatus = z.infer<typeof DesignStatusZod>;
export const DesignsStatusFieldsZod = z.object({
  front: DesignStatusZod.optional(),
  back: DesignStatusZod.optional(),
  sleeve: DesignStatusZod.optional(),
  hood: DesignStatusZod.optional(),
  folder: DesignStatusZod.optional(),
  placket: DesignStatusZod.optional(),
  chestLeft: DesignStatusZod.optional(),
  chestRight: DesignStatusZod.optional(),
  left: DesignStatusZod.optional(),
  right: DesignStatusZod.optional(),
  sleeveLeft: DesignStatusZod.optional(),
  sleeveRight: DesignStatusZod.optional(),
  leftUpperSleeve: DesignStatusZod.optional(),
  rightUpperSleeve: DesignStatusZod.optional(),
  leftCuff: DesignStatusZod.optional(),
  rightCuff: DesignStatusZod.optional(),
  frontEmbroidery: DesignStatusZod.optional(),
  backEmbroidery: DesignStatusZod.optional(),
});
export type DesignsStatusFields = z.infer<typeof DesignsStatusFieldsZod>;

export const ProductionOrderZod = BaseEntityZod.extend({
  productionId: z.string().min(1),
  userSku: z.string().optional(),
  userEmail: z.string().optional(),
  type: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  mockupUrl: z.string().optional(),
  mockupOriginalUrl: z.string().optional(),
  /**
   * Drive URL của file cutting (.pdf). KHÔNG set lúc import đơn — populate qua
   * flow riêng `POST /orders/cutting-files/apply`. Filename gốc dạng
   * 2 chữ cái + "-" + 5 số + "-" + 5 số (vd `BH-96341-30608-*.pdf`,
   * `ML-12345-67890-*.pdf`) → parse productionId match đơn.
   */
  cuttingFileUrl: z.string().optional(),
  /** Tên file cache lúc map (FE hiện ở dialog detail mà không re-fetch Drive). */
  cuttingFileName: z.string().optional(),
  printMethod: z.string().optional(),
  weight: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  length: z.number().optional(),
  quantity: z.number().default(1),
  baseCost: z.number().optional(),
  shipCost: z.number().optional(),
  designs: DesignFieldsZod.optional(),
  designsOriginal: DesignFieldsZod.optional(),
  designsStatus: DesignsStatusFieldsZod.optional(),
  status: z.string().optional(),
  orderId: z.string().optional(),
  externalId: z.string().optional(),
  referent: z.string().optional(),
  orderAt: z.date().optional(),
  inProductionAt: z.date().optional(),

  // Mapping
  isMapped: z.boolean().default(false),
  productConfigId: IDZod.optional(),
  factoryId: IDZod.optional(),
  machineTypeId: IDZod.optional(),
  /**
   * Factory the order was originally mapped to at import time. Compared with
   * `factoryId` to detect transfers (e.g. ML→TN). Set once, never changes.
   */
  originalFactoryId: IDZod.optional(),

  // Workshop fields (Phase 2) — values are workshop_config codes
  printStatus: z.string().optional(),
  printStatusNote: z.string().optional(),
  toolResult: z.string().optional(),
  toolResultNote: z.string().optional(),
  /**
   * Thời điểm đơn LẦN ĐẦU được soát tool (toolResultNote chuyển từ rỗng →
   * có giá trị, qua updateField / bulkUpdateField / importRework). Dùng cho
   * dashboard Vòng đời đơn (chặng "Soát tool") để tính throughput + thời gian
   * TB từ lúc vào sản xuất đến lúc soát xong. Legacy rows backfill bằng
   * `updatedAt` trong `OrderService.onModuleInit`.
   */
  toolCheckedAt: z.date().optional(),
  /**
   * Multi-select workshop_config codes (category=error_file_type). Lưu dạng
   * array — 1 đơn có thể có nhiều lỗi cần sửa. Legacy data dạng string được
   * auto-migrate (xem `OrderModule.onModuleInit`).
   */
  errorFile: z.array(z.string()).optional(),
  errorFileNote: z.string().optional(),
  /** = user._id của sub-designer được gán. Set qua bulk-assign-designer
   *  hoặc field update assignee. Designer-Task-Workflow Phase 6 đổi từ
   *  workshop_config code → userId thuần. */
  assignee: z.string().optional(),
  assigneeNote: z.string().optional(),
  /** workshop_config code (category=fabric_type). Auto-filled at import from product config. */
  fabricType: z.string().optional(),
  /** workshop_config code (category=machine). Auto-filled at import from product config. */
  machineNumber: z.string().optional(),

  // ─── Production error (Phase 8) ────────────────────────────────
  // Xưởng báo lỗi sau khi đã in / chuẩn bị in: chọn lý do lỗi (code thuộc
  // category=production_error) + mô tả tự do. Đơn được coi là "có lỗi" khi
  // `productionError` được set (mọi nơi check: $exists + $ne ''/null).
  productionError: z.string().optional(),
  productionErrorNote: z.string().optional(),
  /**
   * Phân loại nguồn lỗi cho dashboard stats. Auto-fill từ
   * workshop_config.errorSource khi user set productionError. User có thể
   * override khi cần (vd. "Lỗi khác" — ambiguous code).
   */
  productionErrorSource: z.enum(['designer', 'factory']).optional(),
  /**
   * Đếm số lần xưởng đã set productionError trên đơn này. $inc mỗi lần
   * updateField('productionError', non-null) hoặc setProductionError. Dùng để
   * hiển thị "Lỗi ×N" trên cell toolResultNote khi xưởng báo lỗi lần thứ N.
   */
  productionErrorCount: z.number().int().nonnegative().default(0),
  /**
   * Thời điểm đơn lần ĐẦU vào trạng thái lỗi trong cycle hiện tại. Set khi
   * `productionError` chuyển null → value (và field chưa có giá trị). Clear
   * khi `toolResultNote='ok'` hoặc `productionError` được clear (đơn rời tab
   * "Nhật ký bù lỗi"). Dùng để sort + tính mức độ khẩn.
   */
  productionFirstErrorAt: z.date().optional(),

  // Derived: toolResultNote === 'ok'
  readyForFulfill: z.boolean().default(false),

  // ─── Designer task workflow (Phase 1 Designer-Task-Workflow) ─────
  /** State machine; default 'unassigned' khi import; set bởi transition endpoint. */
  designerStatus: DesignerStatusZod.default(DesignerStatus.Unassigned),
  /** Khi leader assign lần đầu — reset khi reassign sang sub khác. */
  designerAssignedAt: z.date().optional(),
  /**
   * Start time của CYCLE hiện tại. Reset mỗi lần `start`/`restart` (per-cycle).
   * Dùng để tính work delta khi `complete` (now - startedAt) → cộng vào
   * `designerWorkMs`.
   */
  designerStartedAt: z.date().optional(),
  /**
   * Start time của LẦN ĐẦU — set 1 lần khi `start` lần đầu, immutable.
   * Dùng để tính avgResponseMin chính xác (firstStartedAt - assignedAt).
   */
  designerFirstStartedAt: z.date().optional(),
  /** Khi sub bấm "Hoàn thành" — overwrite mỗi lần done (rework xong vẫn update). */
  designerCompletedAt: z.date().optional(),
  /** Khi sub bấm "Trả lại". Set kèm `designerRejectedReason`. */
  designerRejectedAt: z.date().optional(),
  /** Khi xưởng set productionError có errorSource='designer'. */
  designerReworkAt: z.date().optional(),
  /** Free-text reason sub-designer nhập khi reject (max 500). */
  designerRejectedReason: z.string().optional(),
  /** Số lần đơn này bị xưởng báo lỗi designer → rework. */
  designerReworkCount: z.number().int().nonnegative().default(0),
  /**
   * Cumulative thời gian designer LÀM thật (ms) — tổng các cycle (lần đầu +
   * rework). $inc khi `complete`. Dùng trực tiếp cho avgWorkMin stats.
   */
  designerWorkMs: z.number().int().nonnegative().default(0),

  // ─── Fulfillment 5-stage workflow ───────────────────────────────
  /**
   * Stage hiện tại đơn đang nằm. null = chưa vào fulfillment (designer chưa
   * done) HOẶC đã hoàn tất hết 5 stage (xem `fulfillmentCompletedAt`).
   * Auto set = `print` khi `designerStatus = done`.
   */
  currentFulfillmentStage: FulfillmentStageZod.optional(),
  /** Set khi stage `pack` complete — đơn coi như xong. */
  fulfillmentCompletedAt: z.date().optional(),
  /** Per-stage state. Init lazy: stage chỉ có entry khi đã được kích hoạt. */
  fulfillmentStages: FulfillmentStagesZod.optional(),
  /** History toàn bộ transition — append-only. UI render timeline. */
  fulfillmentTimeline: FulfillmentTimelineEntryZod.array().default([]),
});
export type ProductionOrder = z.infer<typeof ProductionOrderZod>;

// Whitelist of fields that can be updated inline via PATCH /:id/field.
// Keep in sync with `FIELD_EDIT_PERMS` and `FIELD_CONFIG_CATEGORY` in BE service.
export const ORDER_WORKSHOP_FIELDS = [
  'printStatus',
  'printStatusNote',
  'toolResult',
  'toolResultNote',
  'errorFile',
  'errorFileNote',
  'assignee',
  'assigneeNote',
  'fabricType',
  'machineNumber',
  'productionError',
  'productionErrorNote',
  'productionErrorSource',
] as const;
export type OrderWorkshopField = (typeof ORDER_WORKSHOP_FIELDS)[number];
export const OrderWorkshopFieldZod = z.enum(ORDER_WORKSHOP_FIELDS);

//
export const GetProductionOrdersZod = PageQueryZod.extend({
  isMapped: z.coerce.boolean().optional(),
  factoryId: IDZod.optional(),
  machineTypeId: IDZod.optional(),
  status: z.string().optional(),

  // Workshop filters — comma-separated list of workshop_config codes
  printStatus: z.string().optional(),
  toolResultNote: z.string().optional(),
  assignee: z.string().optional(),
  errorFile: z.string().optional(),
  /** Exact match (CSV) — used by the factory tab product filter. */
  type: z.string().optional(),
  /** Exact match (CSV) — lọc theo SKU khách (bảng phẳng trang "In"). */
  userSku: z.string().optional(),
  /** Comma-separated workshop_config codes for fabric_type. */
  fabricType: z.string().optional(),
  /** Comma-separated workshop_config codes for tool_result. */
  toolResult: z.string().optional(),
  /** Comma-separated workshop_config codes for production_error. */
  productionError: z.string().optional(),
  /** Comma-separated workshop_config codes for machine (numéro máy). */
  machineNumber: z.string().optional(),
  /**
   * Designer state filter — CSV của DesignerStatus value. Hỗ trợ token đặc
   * biệt `__none__` để lọc đơn chưa có designerStatus (data legacy).
   */
  designerStatus: z.string().optional(),
  /** Truthy → chỉ lấy đơn chưa map xưởng (factoryId null / không có). */
  unmapped: z.coerce.boolean().optional(),
  /**
   * Truthy → chỉ lấy đơn có lỗi xưởng (productionError set, khác null/empty).
   * Falsy → chỉ lấy đơn không có lỗi. Bỏ qua khi không có giá trị.
   */
  hasError: z.coerce.boolean().optional(),

  /**
   * Factory transfer filter. Values:
   *   "transferred-in:<factoryId>"  — orders whose current factory is `id`
   *                                   but originalFactoryId is different
   *                                   (i.e. received from another factory).
   *   "transferred-out:<factoryId>" — orders originally at `id` but now
   *                                   running at another factory.
   *   "transferred"                 — any inter-factory transfer.
   *   "pure"                        — originalFactoryId == factoryId (no transfer).
   */
  transferStatus: z.string().optional(),
  /** Comma-separated factoryIds — filter by ORIGINAL factory. */
  originalFactoryId: z.string().optional(),

  /**
   * Print pipeline stage. Mutually exclusive with each other. Used by
   * Dashboard Tab C per-factory drill-down (Đang in / Chưa in / Đã in xong).
   *   "printed"      — printStatus ∈ PRINTED_MACHINE_CODES (đã in xong)
   *   "printing"     — printStatus tồn tại nhưng không phải done code (đang in)
   *   "not-printed"  — printStatus null/empty (chưa in)
   */
  printStage: z.enum(['printed', 'printing', 'not-printed']).optional(),

  /**
   * Lọc theo trạng thái stage Fulfillment (dùng cho bảng trang "In" admin-view
   * — xem FulfillmentWorkflow.md §4.5). Stage suy từ `user.fulfillmentStage`
   * (mặc định print). `watching` cần userId (= assignee context) để elemMatch
   * timeline rework-back của chính user.
   *   waiting / in-progress / rework — currentFulfillmentStage = stage & status tương ứng.
   *   done                            — stage đã completedAt + đã rời stage.
   *   watching                        — user đã rework-back, đang chờ quay lại.
   */
  fulfillmentStatus: z
    .enum(['waiting', 'in-progress', 'rework', 'done', 'watching'])
    .optional(),

  // Date range on `orderAt` — thời gian khách lên đơn (yyyy-mm-dd). Tên giữ
  // là `createdFrom/createdTo` để URL/bookmark cũ không vỡ. Designer/Fulfillment
  // có 7-day window server-side mặc định; truyền 2 field này sẽ override.
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
});
export class GetProductionOrdersDto extends createZodDto(extendApi(GetProductionOrdersZod)) {}

export const GetProductionOrdersResZod = PageResZod.extend({ data: ProductionOrderZod.array() });
export class GetProductionOrdersResDto extends createZodDto(extendApi(GetProductionOrdersResZod)) {}

// Grouped-by-type response — same filter shape as GetProductionOrdersZod, but
// pagination unit is "product type" instead of "row". This avoids splitting
// a single product across pages, which would mis-represent the duplicate-count
// aggregation done on the client.
export const ProductionOrderGroupZod = z.object({
  /** Empty string when the order has no type. */
  type: z.string(),
  /** Number of orders in this group (matching the filter). */
  totalOrders: z.number(),
  /** Sum of `quantity` across orders in this group. */
  totalQuantity: z.number(),
  /** Full list of orders for this type — workshop scans them all. */
  orders: ProductionOrderZod.array(),
});
export type ProductionOrderGroup = z.infer<typeof ProductionOrderGroupZod>;

export const GetGroupedProductionOrdersResZod = PageResZod.extend({
  data: ProductionOrderGroupZod.array(),
});
export class GetGroupedProductionOrdersResDto extends createZodDto(
  extendApi(GetGroupedProductionOrdersResZod),
) {}

// Đếm số đơn theo 5 trạng thái stage Fulfillment (bảng trang "In" admin-view).
export const FulfillmentStatusCountsResZod = ResZod.extend({
  data: z.object({
    all: z.number(),
    waiting: z.number(),
    inProgress: z.number(),
    rework: z.number(),
    done: z.number(),
    watching: z.number(),
  }),
});
export class FulfillmentStatusCountsResDto extends createZodDto(
  extendApi(FulfillmentStatusCountsResZod),
) {}

//
export const ImportProductionOrderRowZod = z.object({
  productionId: z.string().min(1),
  userSku: z.string().optional(),
  userEmail: z.string().optional(),
  type: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  mockupUrl: z.string().optional(),
  printMethod: z.string().optional(),
  weight: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  length: z.number().optional(),
  quantity: z.number().optional(),
  baseCost: z.number().optional(),
  shipCost: z.number().optional(),
  designs: DesignFieldsZod.optional(),
  status: z.string().optional(),
  orderId: z.string().optional(),
  externalId: z.string().optional(),
  referent: z.string().optional(),
  orderAt: z.string().optional(),
  inProductionAt: z.string().optional(),
});
export type ImportProductionOrderRow = z.infer<typeof ImportProductionOrderRowZod>;

export const ImportProductionOrdersZod = z.object({
  rows: ImportProductionOrderRowZod.array().min(1),
});
export class ImportProductionOrdersDto extends createZodDto(extendApi(ImportProductionOrdersZod)) {}

export const ImportProductionOrdersResZod = ResZod.extend({
  data: z.object({
    imported: z.number(),
    updated: z.number(),
    mapped: z.number(),
    unmapped: z.number(),
    skipped: z.array(z.object({ row: z.number(), reason: z.string() })),
  }),
});
export class ImportProductionOrdersResDto extends createZodDto(extendApi(ImportProductionOrdersResZod)) {}

//
// Import file soát (rework) — update các field QC vào đơn hiện có
// theo `productionId`. Không tạo đơn mới, chỉ UPDATE.
//
export const ImportReworkOrderRowZod = z.object({
  productionId: z.string().min(1),
  toolResultNote: z.string().optional(), // sheet không dấu (vd "loi", "ok")
  errorFile: z.string().optional(),       // sheet không dấu (vd "Vien co")
  errorFileNote: z.string().optional(),   // free text; "hủy đơn" → cancel
  assignee: z.string().optional(),        // fullName người thực hiện
});
export type ImportReworkOrderRow = z.infer<typeof ImportReworkOrderRowZod>;

export const ImportReworkOrdersZod = z.object({
  rows: ImportReworkOrderRowZod.array().min(1),
});
export class ImportReworkOrdersDto extends createZodDto(extendApi(ImportReworkOrdersZod)) {}

export const ImportReworkOrdersResZod = ResZod.extend({
  data: z.object({
    updated: z.number(),         // số đơn cập nhật thành công
    notFound: z.number(),        // productionId không tồn tại trong DB
    cancelled: z.number(),       // số đơn bị mark cancel
    assigneeMatched: z.number(), // số row gán assignee thành công
    skipped: z.array(z.object({ row: z.number(), reason: z.string() })),
  }),
});
export class ImportReworkOrdersResDto extends createZodDto(extendApi(ImportReworkOrdersResZod)) {}

//
// Dashboard
//
export const GetOrderDashboardZod = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  searchType: z.string().optional(),
  searchUser: z.string().optional(),
});
export class GetOrderDashboardDto extends createZodDto(extendApi(GetOrderDashboardZod)) {}

export const UserBreakdownZod = z.object({
  userSku: z.string().optional(),
  userEmail: z.string().optional(),
  orderCount: z.number(),
  totalQuantity: z.number(),
  totalProductionCost: z.number(),
  totalShippingCost: z.number(),
  totalCost: z.number(),
});
export type UserBreakdown = z.infer<typeof UserBreakdownZod>;

export const MockupSummaryZod = z.object({
  url: z.string(),
  originalUrl: z.string().optional(),
  count: z.number(),
});
export type MockupSummary = z.infer<typeof MockupSummaryZod>;

export const SizeSummaryZod = z.object({
  size: z.string(),
  count: z.number(),
});
export type SizeSummary = z.infer<typeof SizeSummaryZod>;

export const TypeSummaryZod = z.object({
  type: z.string(),
  quantity: z.number(),
  minCost: z.number(),
  maxCost: z.number(),
  productionCost: z.number(),
  shippingCost: z.number(),
  totalCost: z.number(),
  uniqueMockupCount: z.number(),
  duplicateMockupCount: z.number(),
  sizes: SizeSummaryZod.array(),
  mockups: MockupSummaryZod.array(),
  duplicateMockups: MockupSummaryZod.array(),
});
export type TypeSummary = z.infer<typeof TypeSummaryZod>;

export const MachineTypeBreakdownZod = z.object({
  machineTypeId: z.string().optional(),
  machineTypeName: z.string(),
  machineTypeShortName: z.string().optional(),
  quantity: z.number(),
  percentage: z.number(),
});
export type MachineTypeBreakdown = z.infer<typeof MachineTypeBreakdownZod>;

export const FactoryBreakdownZod = z.object({
  factoryId: z.string().optional(),
  factoryName: z.string(),
  factoryShortName: z.string().optional(),
  quantity: z.number(),
  percentage: z.number(),
  byMachineType: MachineTypeBreakdownZod.array(),
});
export type FactoryBreakdown = z.infer<typeof FactoryBreakdownZod>;

/**
 * Phục vụ bảng pivot "Số lượng theo size mỗi sản phẩm" có lọc theo xưởng.
 * Mỗi row = 1 cặp (factory, type) kèm phân bổ size. FE gom dropdown xưởng từ
 * distinct factoryId, và pivot type × size theo xưởng đang chọn.
 */
export const SizeMatrixRowZod = z.object({
  factoryId: z.string().optional(),
  factoryName: z.string(),
  type: z.string(),
  sizes: SizeSummaryZod.array(),
});
export type SizeMatrixRow = z.infer<typeof SizeMatrixRowZod>;

export const OrderDashboardZod = z.object({
  totals: z.object({
    totalOrders: z.number(),
    totalQuantity: z.number(),
    totalProductionCost: z.number(),
    totalShippingCost: z.number(),
    totalCost: z.number(),
  }),
  byType: TypeSummaryZod.array(),
  byFactory: FactoryBreakdownZod.array(),
  sizeMatrix: SizeMatrixRowZod.array(),
  byUser: UserBreakdownZod.array(),
  filter: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    searchType: z.string().optional(),
    searchUser: z.string().optional(),
  }),
});
export type OrderDashboard = z.infer<typeof OrderDashboardZod>;

export const GetOrderDashboardResZod = ResZod.extend({ data: OrderDashboardZod });
export class GetOrderDashboardResDto extends createZodDto(extendApi(GetOrderDashboardResZod)) {}

//
// Phase 2 — Inline / Bulk update workshop field
//
/**
 * `value` accept:
 *  - `string`         — select code đơn (vd printStatus, toolResult) hoặc
 *                       free-text errorFileNote.
 *  - `string[]`       — multi-select field (hiện chỉ `errorFile`). BE tự
 *                       validate từng item.
 *  - `null` / empty   — clear value.
 */
export const UpdateOrderFieldZod = z.object({
  field: OrderWorkshopFieldZod,
  value: z.union([z.string(), z.array(z.string())]).nullable(),
});
export class UpdateOrderFieldDto extends createZodDto(extendApi(UpdateOrderFieldZod)) {}

export const UpdateOrderFieldResZod = ResZod.extend({ data: ProductionOrderZod });
export class UpdateOrderFieldResDto extends createZodDto(extendApi(UpdateOrderFieldResZod)) {}

export const BulkUpdateOrderFieldZod = z.object({
  ids: IDZod.array().min(1),
  field: OrderWorkshopFieldZod,
  value: z.union([z.string(), z.array(z.string())]).nullable(),
});
export class BulkUpdateOrderFieldDto extends createZodDto(extendApi(BulkUpdateOrderFieldZod)) {}

export const BulkUpdateOrderFieldResZod = ResZod.extend({
  data: z.object({
    matched: z.number(),
    modified: z.number(),
  }),
});
export class BulkUpdateOrderFieldResDto extends createZodDto(extendApi(BulkUpdateOrderFieldResZod)) {}

//
// Bulk assign designer — wrapper riêng cho assignee với pre-flight stats +
// detailed skipped report. Reuse được bulk-field nhưng UX gọn hơn nhiều khi
// gắn cho 1 designer cụ thể.
//
export const BulkAssignDesignerPreviewZod = z.object({
  ids: IDZod.array().min(1),
});
export class BulkAssignDesignerPreviewDto extends createZodDto(
  extendApi(BulkAssignDesignerPreviewZod),
) {}

export const BulkAssignDesignerPreviewResZod = ResZod.extend({
  data: z.object({
    total: z.number(),
    /** Đếm theo designerStatus hiện tại của các đơn được chọn. */
    byStatus: z.object({
      unassigned: z.number(),
      assigned: z.number(),
      inProgress: z.number(),
      done: z.number(),
      rejected: z.number(),
      rework: z.number(),
    }),
    /** Đơn đã được gán cho designer khác (assignee != null). */
    alreadyAssigned: z
      .object({
        userId: z.string(),
        fullName: z.string().optional(),
        count: z.number(),
      })
      .array(),
    /** Số đơn sẽ bị skip do status (đang in-progress/done). */
    blockedCount: z.number(),
    /** Số đơn 'cần làm lại' đang có người ôm (assignee != null) — KHÔNG gán cho
     * người khác được, chỉ gán đơn rework chưa có ai ôm. */
    reworkHeldCount: z.number(),
    /** Số đơn có `toolResultNote='ok'` — KHÔNG cho gán designer (đã soát ok). */
    okCount: z.number(),
    /** Số đơn CHƯA soát (`toolResultNote` rỗng) — gán được nhưng cần confirm. */
    noToolCount: z.number(),
    /** Số đơn hợp lệ để assign (reassignable status VÀ toolResultNote != 'ok') — gồm cả chưa soát. */
    eligibleCount: z.number(),
    /** Subset của eligible nhưng ĐÃ soát (toolResultNote non-empty != 'ok') — dùng cho nút "Chỉ gán đơn đã soát". */
    eligibleWithToolCount: z.number(),
  }),
});
export class BulkAssignDesignerPreviewResDto extends createZodDto(
  extendApi(BulkAssignDesignerPreviewResZod),
) {}

export const BulkAssignDesignerZod = z.object({
  ids: IDZod.array().min(1),
  /** Target user (sub-designer) — = user._id. */
  userId: IDZod,
  /** Nếu false (default) → từ chối khi có đơn đã assign cho người khác (an
   * toàn). FE confirm rồi đặt true để override. */
  reassignOthers: z.boolean().default(false),
  /** Nếu true → bỏ qua đơn CHƯA soát (`toolResultNote` rỗng). Tương ứng nút
   * "Chỉ gán đơn đã soát" ở dialog. Default false = gán tất cả. */
  skipUnreviewed: z.boolean().default(false),
});
export class BulkAssignDesignerDto extends createZodDto(extendApi(BulkAssignDesignerZod)) {}

export const BulkAssignDesignerResZod = ResZod.extend({
  data: z.object({
    matched: z.number(),
    modified: z.number(),
    /** ID + lý do của những đơn không assign được. */
    skipped: z
      .object({
        orderId: z.string(),
        productionId: z.string(),
        reason: z.string(),
      })
      .array(),
  }),
});
export class BulkAssignDesignerResDto extends createZodDto(extendApi(BulkAssignDesignerResZod)) {}

//
// Set production error atomic — wrapper riêng cho việc set 3 field cùng lúc
// (productionError + productionErrorSource + productionErrorNote). Cần thiết
// khi user chọn code "Lỗi khác" → bắt buộc nhập source + note.
//
export const SetProductionErrorZod = z.object({
  /** Workshop_config code; null = clear hẳn lỗi. */
  code: z.string().nullable(),
  /** Required khi code='other' (BE validate). Auto-fill từ config nếu vắng. */
  source: z.enum(['designer', 'factory']).optional(),
  /** Required khi code='other' (BE validate). */
  note: z.string().max(500).optional(),
});
export class SetProductionErrorDto extends createZodDto(extendApi(SetProductionErrorZod)) {}

export const SetProductionErrorResZod = ResZod.extend({ data: ProductionOrderZod });
export class SetProductionErrorResDto extends createZodDto(extendApi(SetProductionErrorResZod)) {}

//
// Scan barcode lookup — workshop quét máy USB → tìm đơn theo productionId
// exact match (case-insensitive). Trả về đủ field cho dialog gán lỗi:
// info đơn + factory + machineType + fulfillmentStages hiện tại.
//
export const GetOrderByProductionIdResZod = ResZod.extend({ data: ProductionOrderZod });
export class GetOrderByProductionIdResDto extends createZodDto(
  extendApi(GetOrderByProductionIdResZod),
) {}

//
// Import summary — aggregates orders of a single day across all imports.
// Workshop uses this to spot duplicate (type, size, fabric) combinations
// so the same blank batch can be printed together.
//
export const ImportSummaryGroupZod = z.object({
  type: z.string(),
  size: z.string(),
  fabricType: z.string(),
  /** Resolved fabric label (Cotton Jersey, G5000…) for FE display. */
  fabricName: z.string().optional(),
  /** Sum of order.quantity in this combination. */
  totalQuantity: z.number(),
  /** Number of distinct orders (rows). */
  orderCount: z.number(),
  /** Sample production IDs (max 5) so the workshop can pull them up. */
  sampleProductionIds: z.string().array(),
});
export type ImportSummaryGroup = z.infer<typeof ImportSummaryGroupZod>;

export const ImportSummaryZod = z.object({
  date: z.string(),
  totalOrders: z.number(),
  totalQuantity: z.number(),
  groups: ImportSummaryGroupZod.array(),
});
export type ImportSummary = z.infer<typeof ImportSummaryZod>;

export const GetImportSummaryZod = z.object({
  /** yyyy-mm-dd; defaults to today on the server. */
  date: z.string().optional(),
});
export class GetImportSummaryDto extends createZodDto(extendApi(GetImportSummaryZod)) {}

export const GetImportSummaryResZod = ResZod.extend({ data: ImportSummaryZod });
export class GetImportSummaryResDto extends createZodDto(extendApi(GetImportSummaryResZod)) {}

//
// Factory transfer — move orders between factories without losing their origin.
//
export const TransferOrderZod = z.object({
  targetFactoryId: IDZod,
  /** Free-text reason logged with the audit entry. */
  reason: z.string().max(200).optional(),
});
export class TransferOrderDto extends createZodDto(extendApi(TransferOrderZod)) {}

export const BulkTransferOrderZod = z.object({
  ids: IDZod.array().min(1),
  targetFactoryId: IDZod,
  reason: z.string().max(200).optional(),
});
export class BulkTransferOrderDto extends createZodDto(extendApi(BulkTransferOrderZod)) {}

export const TransferOrderResZod = ResZod.extend({
  data: z.object({ matched: z.number(), modified: z.number() }),
});
export class TransferOrderResDto extends createZodDto(extendApi(TransferOrderResZod)) {}

/**
 * Initial-assign factory (+ optional setup fields) cho 1 hoặc nhiều đơn chưa
 * map xưởng (`factoryId` null). Khác bulk-transfer ở chỗ: chỉ áp dụng cho đơn
 * UNMAPPED, set luôn `originalFactoryId = factoryId` (đơn coi là "thuần" gốc
 * tại xưởng này), và gộp set 4 trường tuỳ chọn (loại vải/phòng/máy/tool) trong
 * 1 update + 1 log entry/đơn.
 *
 * Đơn đã có factory thì dùng `bulk-transfer` (route riêng) — endpoint này sẽ
 * skip đơn đã mapped trong `matched` count.
 */
export const BulkAssignOrderZod = z.object({
  ids: IDZod.array().min(1),
  factoryId: IDZod,
  fabricType: z.string().optional(),
  machineTypeId: IDZod.optional(),
  machineNumber: z.string().optional(),
  toolResult: z.string().optional(),
  reason: z.string().max(200).optional(),
});
export class BulkAssignOrderDto extends createZodDto(extendApi(BulkAssignOrderZod)) {}

export const BulkAssignOrderResZod = ResZod.extend({
  data: z.object({ matched: z.number(), modified: z.number() }),
});
export class BulkAssignOrderResDto extends createZodDto(extendApi(BulkAssignOrderResZod)) {}

//
// Factory overview — used by the new "Đơn hàng theo xưởng" dashboard tab.
//

/** Option list shown in the factory tab filter selects + Summary breakdowns. */
export const FactoryFilterOptionZod = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number(),
});
export type FactoryFilterOption = z.infer<typeof FactoryFilterOptionZod>;

export const FactoryOverviewCellZod = z.object({
  factoryId: z.string(),
  factoryName: z.string(),
  factoryShortName: z.string().optional(),
  /** Total orders CURRENTLY producing here. */
  total: z.number(),
  /** Pure orders (no transfer) currently here. */
  pure: z.number(),
  /** Orders received from other factories (transferred in). */
  transferredIn: z.number(),
  /** Orders that ORIGINATED here but are now elsewhere (transferred out). */
  transferredOut: z.number(),
  /** Distinct `type` values currently here. */
  productCount: z.number(),
  /** Distinct `fabricType` values currently here. */
  fabricCount: z.number(),
  /** Distinct `machineTypeId` values currently here — semantically "Phòng" / loại máy in. */
  machineCount: z.number(),
  /** Distinct `machineNumber` values currently here — số máy thực (94, 27, 56…). */
  actualMachineCount: z.number(),
  /** Orders here whose `toolResult` resolves to a "has tool" code. */
  withToolCount: z.number(),
  /** Đã in xong — printStatus là 1 trong PRINTED_MACHINE_CODES. */
  printedCount: z.number(),
  /** Đang in — printStatus tồn tại nhưng không phải done code. */
  printingCount: z.number(),
  /** Chưa in — printStatus null/empty. */
  notPrintedCount: z.number(),
  /** Lỗi xưởng — productionError tồn tại và khác empty. Disjoint với 3 print stage. */
  errorCount: z.number(),
  /** Design đã được gán designer (designerStatus ≠ unassigned/null). được gán + chưa gán = total. */
  designAssignedCount: z.number(),
  /** Design chưa gán designer (designerStatus unassigned/null). */
  designUnassignedCount: z.number(),
  /** Design đã xong (designerStatus = done). đã xong + chưa xong = total. */
  designDoneCount: z.number(),
  /** Design chưa xong (designerStatus ≠ done). */
  designNotDoneCount: z.number(),
  /** Top-N per-dimension breakdowns used by the Summary sub-tab. */
  breakdowns: z.object({
    products: FactoryFilterOptionZod.array(),
    fabrics: FactoryFilterOptionZod.array(),
    sizes: FactoryFilterOptionZod.array(),
    toolResults: FactoryFilterOptionZod.array(),
  }),
});
export type FactoryOverviewCell = z.infer<typeof FactoryOverviewCellZod>;

export const FactoryFlowZod = z.object({
  fromFactoryId: z.string(),
  fromName: z.string(),
  fromShortName: z.string().optional(),
  toFactoryId: z.string(),
  toName: z.string(),
  toShortName: z.string().optional(),
  count: z.number(),
  totalQuantity: z.number(),
});
export type FactoryFlow = z.infer<typeof FactoryFlowZod>;

export const FactoryOverviewZod = z.object({
  factories: FactoryOverviewCellZod.array(),
  flows: FactoryFlowZod.array(),
  totals: z.object({
    total: z.number(),
    transferred: z.number(),
    pure: z.number(),
    /** Đơn nằm trong date range nhưng chưa map xưởng (factoryId null). */
    unmapped: z.number(),
  }),
  /** Distinct values within the date range — used to populate filter selects. */
  availableFilters: z.object({
    products: FactoryFilterOptionZod.array(),
    fabrics: FactoryFilterOptionZod.array(),
    toolResults: FactoryFilterOptionZod.array(),
    /** machineTypeId — semantically "Phòng" (loại máy in). */
    machineTypes: FactoryFilterOptionZod.array(),
    /** workshop_config.machine codes — số máy thực. */
    machines: FactoryFilterOptionZod.array(),
    /** workshop_config.tool_result_note codes — cột "Note kq Tool". */
    toolResultNotes: FactoryFilterOptionZod.array(),
    /** userSku (khách sở hữu đơn) — top theo số đơn trong kỳ. */
    users: FactoryFilterOptionZod.array(),
  }),
});
export type FactoryOverview = z.infer<typeof FactoryOverviewZod>;

export const GetFactoryOverviewZod = z.object({
  // Date range on `orderAt` — tên giữ để URL không phá. Xem comment ở
  // GetProductionOrdersZod.
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  /**
   * When set, scopes the filter dropdowns (`availableFilters`) to orders
   * currently at this factory. The 3 factory cards + flow matrix stay
   * unscoped so the global view is preserved.
   */
  factoryId: z.string().optional(),
  /**
   * Optional — further scope `availableFilters` by print pipeline stage so
   * dropdowns only show products/fabrics/etc that exist in that stage at
   * the selected factory. Same enum as `printStage` on list endpoint.
   */
  printStage: z.enum(['printed', 'printing', 'not-printed']).optional(),
  /**
   * Optional — scope `availableFilters` chỉ về đơn có lỗi xưởng (Phase 8).
   * Mutually exclusive với printStage trên FE (chip "Lỗi xưởng" thay vị trí
   * "Đang in"). `true` → `productionError $exists & != ''`.
   */
  hasError: z.coerce.boolean().optional(),
  /**
   * Optional — scope tất cả `availableFilters` về đơn chưa map xưởng. Mutually
   * exclusive với `factoryId`/`printStage`/`hasError` trên FE (chip "Chưa xác
   * định xưởng" thay cho chip xưởng).
   */
  unmapped: z.coerce.boolean().optional(),
  /**
   * Faceted select filters — used to narrow OTHER `availableFilters` so the
   * dropdown counts reflect the current cross-filter scope. Each facet excludes
   * its own field when computing its options (so user can switch values).
   */
  type: z.string().optional(),
  fabricType: z.string().optional(),
  toolResult: z.string().optional(),
  /** workshop_config codes (category=tool_result_note) — cột "Note kq Tool". */
  toolResultNote: z.string().optional(),
  /** userSku (khách sở hữu đơn) — CSV. Lọc bảng đơn + thu hẹp dropdown. */
  userSku: z.string().optional(),
  machineTypeId: z.string().optional(),
  machineNumber: z.string().optional(),
});
export class GetFactoryOverviewDto extends createZodDto(extendApi(GetFactoryOverviewZod)) {}

export const GetFactoryOverviewResZod = ResZod.extend({ data: FactoryOverviewZod });
export class GetFactoryOverviewResDto extends createZodDto(extendApi(GetFactoryOverviewResZod)) {}

/**
 * Faceted filter options cho workshop table view. BE compute count theo
 * cross-facet (loại trừ chính facet đó khỏi filter để user thấy được tất cả
 * lựa chọn của facet đó nhưng các facet khác đã narrow theo selection).
 *
 * Khai báo cuối file vì phụ thuộc `FactoryFilterOptionZod` (định nghĩa ở mục
 * Factory overview). Tsup bundle theo thứ tự source — đặt trước sẽ sinh
 * `Cannot read properties of undefined (reading 'array')` lúc require.
 */
export const WorkshopAvailableFiltersResZod = ResZod.extend({
  data: z.object({
    printStatus: FactoryFilterOptionZod.array(),
    toolResultNote: FactoryFilterOptionZod.array(),
    /** label = user.fullName (đã resolve); value = user._id; token `__none__` cho đơn chưa gán. */
    assignee: FactoryFilterOptionZod.array(),
    productionError: FactoryFilterOptionZod.array(),
    fabricType: FactoryFilterOptionZod.array(),
    machineNumber: FactoryFilterOptionZod.array(),
    toolResult: FactoryFilterOptionZod.array(),
    errorFile: FactoryFilterOptionZod.array(),
    /** Designer state — value = DesignerStatus, label hiển thị tiếng Việt. */
    designerStatus: FactoryFilterOptionZod.array(),
    /** Tên sản phẩm (type) — value = label = type. Dùng cho bảng phẳng trang "In". */
    type: FactoryFilterOptionZod.array().optional(),
    /** SKU khách (userSku) — value = label = userSku. Dùng cho bảng phẳng trang "In". */
    userSku: FactoryFilterOptionZod.array().optional(),
  }),
});
export class WorkshopAvailableFiltersResDto extends createZodDto(
  extendApi(WorkshopAvailableFiltersResZod),
) {}
export type WorkshopAvailableFilters = z.infer<
  typeof WorkshopAvailableFiltersResZod
>['data'];

/**
 * Body của `POST /v1/orders/:id/designer-transition`. Server validate action
 * hợp lệ với state hiện tại + owner constraint (sub-designer chỉ transition
 * task có `assignee === user.assigneeCode`). Side effects (auto set toolResultNote,
 * increment reworkCount, log…) handle ở `DesignerTaskService`.
 */
export const DesignerTransitionZod = z.object({
  action: DesignerTransitionActionZod,
  /** Required khi action='reject', optional cho các action khác. */
  reason: z.string().max(500).optional(),
});
export class DesignerTransitionDto extends createZodDto(extendApi(DesignerTransitionZod)) {}

export const DesignerTransitionResZod = ResZod.extend({ data: ProductionOrderZod });
export class DesignerTransitionResDto extends createZodDto(extendApi(DesignerTransitionResZod)) {}

//
// Error log tab — danh sách đơn đang ở trạng thái lỗi xưởng (productionError
// set, toolResultNote chưa 'ok'), sort theo productionFirstErrorAt ASC để đơn
// nằm lâu nhất hiển thị đầu tiên. Mức độ khẩn cấp tính client-side từ
// productionFirstErrorAt theo ngưỡng 24h/48h/72h.
//

export const ERROR_LOG_URGENCY_LEVELS = ['new', 'attention', 'urgent', 'critical'] as const;
export type ErrorLogUrgency = (typeof ERROR_LOG_URGENCY_LEVELS)[number];
export const ErrorLogUrgencyZod = z.enum(ERROR_LOG_URGENCY_LEVELS);

export const GetErrorLogZod = PageQueryZod.extend({
  /** Comma-separated user._id của designer được gán đơn (`__none__` cho đơn chưa gán). */
  assignee: z.string().optional(),
  /** Comma-separated workshop_config codes (fabric_type). */
  fabricType: z.string().optional(),
  /** Comma-separated workshop_config codes (tool_result). */
  toolResult: z.string().optional(),
  /** Comma-separated workshop_config codes (production_error). */
  productionError: z.string().optional(),
  /** Comma-separated 'designer' | 'factory'. */
  productionErrorSource: z.string().optional(),
  /** Comma-separated factoryIds. */
  factoryId: z.string().optional(),
  /** Comma-separated urgency level. */
  urgency: z.string().optional(),
  /** Date range theo `inProductionAt` (VN tz) — đồng bộ với các bảng order
   *  khác đã dùng `inProductionAt` thay cho `orderAt`. */
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
});
export class GetErrorLogDto extends createZodDto(extendApi(GetErrorLogZod)) {}

export const GetErrorLogResZod = PageResZod.extend({
  data: ProductionOrderZod.array(),
  /** Tổng theo mức độ khẩn (bỏ qua pagination). */
  byUrgency: z.object({
    new: z.number(),
    attention: z.number(),
    urgent: z.number(),
    critical: z.number(),
  }),
});
export class GetErrorLogResDto extends createZodDto(extendApi(GetErrorLogResZod)) {}

//
// ─── Fulfillment workflow ─────────────────────────────────────────
//

/**
 * Body của `POST /v1/orders/:id/fulfillment-transition`.
 *
 * State machine theo `(stage, action, currentStatus)`:
 *   start        : waiting/rework → in-progress (assignee = current user, BE check)
 *   complete     : in-progress    → done        (cộng workMs, auto-advance stage tiếp)
 *   rework-back  : in-progress    → waiting     (reporter giữ assignee)
 *                                target stage   → rework, các stage trung gian → rework
 *                                currentFulfillmentStage = target
 *                                target='designer' → reuse designer rework flow
 *
 * Validate ở BE: action='rework-back' yêu cầu `target` + `reason`. Target nếu
 * là FulfillmentStage thì phải có index < current stage; nếu là 'designer'
 * thì set productionErrorSource='designer'.
 */
export const FulfillmentTransitionZod = z.object({
  stage: FulfillmentStageZod,
  action: FulfillmentTransitionActionZod,
  /** Required khi action='rework-back': 'designer' hoặc FulfillmentStage trước stage hiện tại. */
  target: z.union([z.literal('designer'), FulfillmentStageZod]).optional(),
  /** Required khi action='rework-back'. */
  reason: z.string().max(500).optional(),
});
export class FulfillmentTransitionDto extends createZodDto(extendApi(FulfillmentTransitionZod)) {}

export const FulfillmentTransitionResZod = ResZod.extend({ data: ProductionOrderZod });
export class FulfillmentTransitionResDto extends createZodDto(
  extendApi(FulfillmentTransitionResZod),
) {}

/**
 * GET `/v1/fulfillment/my-tasks?tab=waiting|in-progress|rework|watching`.
 * Stage + factory tự suy từ user đang login (BE filter). User Manager/Admin
 * có thể override qua query `stage`/`factoryId`.
 */
export const FULFILLMENT_TASK_TABS = [
  'waiting',
  'in-progress',
  'rework',
  'done',
  'watching',
  /**
   * Đơn đã `readyForFulfill=true` nhưng chưa được gán vào Designer
   * (designerStatus = unassigned, currentFulfillmentStage chưa set). CHỈ visible
   * cho admin/manager — workers fulfillment không thấy tab này. Admin gán đơn
   * vào Designer cụ thể → đơn theo flow chuẩn (designer.complete → Print stage).
   */
  'unassigned',
] as const;
export type FulfillmentTaskTab = (typeof FULFILLMENT_TASK_TABS)[number];
export const FulfillmentTaskTabZod = z.enum(FULFILLMENT_TASK_TABS);

export const GetFulfillmentMyTasksZod = PageQueryZod.extend({
  tab: FulfillmentTaskTabZod.default('waiting'),
  /** Page size — kanban load full queue per cột (default 50, tối đa 5000). */
  size: z.coerce.number().optional(),
  /** Override (Manager/Admin). User Fulfillment không cần set. */
  stage: FulfillmentStageZod.optional(),
  factoryId: IDZod.optional(),
  /**
   * Date range filter trên `inProductionAt` (YYYY-MM-DD, VN local). Match
   * semantic của `GetProductionOrdersZod.createdFrom/To` để 2 page (My Tasks
   * + Factory Tab) cùng scope. BE default = 7 ngày khi cả 2 đều empty;
   * empty string truyền lên = user clear → all-time.
   */
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
});
export class GetFulfillmentMyTasksDto extends createZodDto(extendApi(GetFulfillmentMyTasksZod)) {}

export const GetFulfillmentMyTasksResZod = PageResZod.extend({
  data: ProductionOrderZod.array(),
  /** Tab counters (6 tab) — bỏ qua pagination. `unassigned` = 0 với worker
   *  fulfillment (chỉ admin/manager thấy). */
  tabCounts: z.object({
    waiting: z.number(),
    inProgress: z.number(),
    rework: z.number(),
    done: z.number(),
    watching: z.number(),
    unassigned: z.number(),
  }),
});
export class GetFulfillmentMyTasksResDto extends createZodDto(
  extendApi(GetFulfillmentMyTasksResZod),
) {}

/**
 * Admin team queue (`GET /v1/fulfillment/team/queue?factoryId=`).
 * Trả về 5 column × N order mỗi column (cap 100 / column).
 */
export const FulfillmentQueueColumnZod = z.object({
  stage: FulfillmentStageZod,
  /** = users{factoryId, fulfillmentStage}._id (1 user duy nhất hoặc null nếu chưa gán). */
  workerId: z.string().optional(),
  workerName: z.string().optional(),
  /** Counts mỗi status. */
  counts: z.object({
    waiting: z.number(),
    inProgress: z.number(),
    rework: z.number(),
    done: z.number(),
  }),
  /** Top 100 orders theo orderAt DESC. */
  orders: ProductionOrderZod.array(),
});
export type FulfillmentQueueColumn = z.infer<typeof FulfillmentQueueColumnZod>;

export const GetFulfillmentQueueZod = z.object({
  factoryId: IDZod,
});
export class GetFulfillmentQueueDto extends createZodDto(extendApi(GetFulfillmentQueueZod)) {}

export const GetFulfillmentQueueResZod = ResZod.extend({
  data: z.object({
    factoryId: z.string(),
    factoryName: z.string().optional(),
    columns: FulfillmentQueueColumnZod.array(),
  }),
});
export class GetFulfillmentQueueResDto extends createZodDto(
  extendApi(GetFulfillmentQueueResZod),
) {}

/** Stats — throughput per period (morning/noon/evening hoặc daily/weekly). */
export const FulfillmentStageStatRowZod = z.object({
  stage: FulfillmentStageZod,
  received: z.number(),
  inProgress: z.number(),
  done: z.number(),
  reworkOut: z.number(),
  reworkIn: z.number(),
  avgWorkMs: z.number(),
  backlog: z.number(),
});
export type FulfillmentStageStatRow = z.infer<typeof FulfillmentStageStatRowZod>;

export const GetFulfillmentStatsZod = z.object({
  factoryId: IDZod.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export class GetFulfillmentStatsDto extends createZodDto(extendApi(GetFulfillmentStatsZod)) {}

export const GetFulfillmentStatsResZod = ResZod.extend({
  data: z.object({
    perStage: FulfillmentStageStatRowZod.array(),
    /** Avg cycle time (ms) toàn flow: designerCompletedAt → fulfillmentCompletedAt. */
    avgTotalCycleMs: z.number(),
    /** Đơn pack.done trong range. */
    completedCount: z.number(),
  }),
});
export class GetFulfillmentStatsResDto extends createZodDto(
  extendApi(GetFulfillmentStatsResZod),
) {}

// ─── Lifecycle Overview (dashboard Vòng đời đơn) ──────────────────
// Phễu 9 chặng: Soát tool → Thiết kế → In → Ép → QC sau ép → QC phân hàng →
// May nhận → May xuất → Đóng hàng. Mỗi chặng đo snapshot (đang chứa/đang làm/
// rework/lỗi) + throughput theo kỳ (hoàn thành + thời gian TB). Xem
// `documents/FunctionDescription/OrderLifecycle.md`.

/** Khóa chặng — 'tool-check' + 'designer' + 7 FulfillmentStage. */
export const LIFECYCLE_STAGE_KEYS = [
  'tool-check',
  'designer',
  'print',
  'press',
  'qc-post-press',
  'qc-sorting',
  'sew-in',
  'sew-out',
  'pack',
] as const;
export type LifecycleStageKey = (typeof LIFECYCLE_STAGE_KEYS)[number];

export const LifecycleStageRowZod = z.object({
  stage: z.string(),
  label: z.string(),
  /** Đang chờ tại chặng này (snapshot). Tool-check = số đơn chưa soát. */
  backlog: z.number(),
  /**
   * Đã tới công đoạn nhưng worker CHƯA bấm Bắt đầu (chờ nhận task).
   * Designer = `assigned` (đã giao, sub chưa nhận); Fulfillment = `waiting`
   * (= backlog); Tool-check = 0 (không có khái niệm nhận task).
   */
  waitingToStart: z.number(),
  /** Đang làm (snapshot). Tool-check không có → 0. */
  inProgress: z.number(),
  /** Đang rework (snapshot). */
  rework: z.number(),
  /** Đang lỗi tại chặng (snapshot). */
  error: z.number(),
  /** Đã hoàn thành chặng trong kỳ (throughput theo date range). */
  doneInRange: z.number(),
  /** Tổng đơn đã từng qua chặng này (cumulative snapshot). Tool-check = đã soát. */
  passedTotal: z.number(),
  /** Thời gian hoàn thành TB (ms) của các đơn done trong kỳ. 0 nếu N/A. */
  avgWorkMs: z.number(),
});
export type LifecycleStageRow = z.infer<typeof LifecycleStageRowZod>;

export const LifecycleTimelineBucketZod = z.object({
  date: z.string(), // YYYY-MM-DD (VN tz)
  completed: z.number(),
});
export type LifecycleTimelineBucket = z.infer<typeof LifecycleTimelineBucketZod>;

export const LifecycleOverviewZod = z.object({
  stages: LifecycleStageRowZod.array(),
  totals: z.object({
    /** Đơn còn trong pipeline (chưa pack done, chưa hủy). */
    totalActive: z.number(),
    /** Đơn pack.done trong kỳ. */
    completedInRange: z.number(),
    /** Cycle time TB toàn flow (ms): designerFirstStartedAt/createdAt → fulfillmentCompletedAt. */
    avgTotalCycleMs: z.number(),
    /** Chặng tắc nghẽn (backlog lớn nhất) — null nếu pipeline rỗng. */
    bottleneckStage: z.string().nullable(),
  }),
  /** Line chart: số đơn hoàn thành toàn flow mỗi ngày trong kỳ. */
  completionTimeline: LifecycleTimelineBucketZod.array(),
  /** Options cho dropdown lọc xưởng (chỉ xưởng có đơn). */
  factories: z
    .object({ factoryId: z.string(), factoryName: z.string() })
    .array(),
  filter: z.object({ factoryId: z.string().optional(), from: z.string().optional(), to: z.string().optional() }),
});
export type LifecycleOverview = z.infer<typeof LifecycleOverviewZod>;

export const GetLifecycleOverviewZod = z.object({
  factoryId: IDZod.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export class GetLifecycleOverviewDto extends createZodDto(extendApi(GetLifecycleOverviewZod)) {}

export const GetLifecycleOverviewResZod = ResZod.extend({ data: LifecycleOverviewZod });
export class GetLifecycleOverviewResDto extends createZodDto(
  extendApi(GetLifecycleOverviewResZod),
) {}

// ─── Cutting File mapping (post-import flow) ──────────────────────
// User dán list Drive link → BE fetch tên file (public Drive page) → parse
// productionId từ filename (`BH-XXXXX-XXXXX-*`) → match đơn → trả về preview
// chi tiết. Bước 2 (Apply) chấp nhận overwrite flag để ghi đè đơn đã có file
// cũ. Xem `documents/FunctionDescription/Orders.md §Cutting File Mapping`.

// Pattern productionId trong filename: 2 chữ cái + "-" + 5 chữ số + "-" + 5 chữ số.
// 2 chữ cái KHÔNG cố định "BH" — có thể là bất kỳ A-Z (ML, TN, BH...).
// Ví dụ: `BH-96341-30608-M-BR-KL.pdf`, `ML-12345-67890-...`.
const CUTTING_FILE_PRODUCTION_ID_REGEX = /^([A-Z]{2}-\d{5}-\d{5})/i;
export function parseProductionIdFromCuttingFilename(filename: string): string | null {
  const m = filename.match(CUTTING_FILE_PRODUCTION_ID_REGEX);
  return m ? m[1].toUpperCase() : null;
}

export const CuttingFileMatchedZod = z.object({
  link: z.string(),
  fileId: z.string(),
  fileName: z.string(),
  productionId: z.string(),
  orderId: IDZod,
  factoryId: IDZod.optional(),
  factoryName: z.string().optional(),
  machineTypeId: IDZod.optional(),
  machineTypeName: z.string().optional(),
  /** URL hiện tại nếu đơn đã có file cũ (để FE hiện cảnh báo + ghi đè). */
  existingCuttingFileUrl: z.string().optional(),
  existingCuttingFileName: z.string().optional(),
});
export type CuttingFileMatched = z.infer<typeof CuttingFileMatchedZod>;

export const CuttingFileNotFoundZod = z.object({
  link: z.string(),
  fileId: z.string(),
  fileName: z.string(),
  productionId: z.string(),
});
export type CuttingFileNotFound = z.infer<typeof CuttingFileNotFoundZod>;

export const CuttingFileInvalidZod = z.object({
  link: z.string(),
  /** Vì sao invalid: 'invalid-url' | 'fetch-failed' | 'parse-failed' | 'no-production-id'. */
  reason: z.enum(['invalid-url', 'fetch-failed', 'parse-failed', 'no-production-id']),
  fileName: z.string().optional(),
});
export type CuttingFileInvalid = z.infer<typeof CuttingFileInvalidZod>;

export const CuttingFileConflictZod = z.object({
  productionId: z.string(),
  links: z.string().array(),
});
export type CuttingFileConflict = z.infer<typeof CuttingFileConflictZod>;

export const CuttingFileBreakdownRowZod = z.object({
  /** factoryId nếu nhóm theo xưởng, machineTypeId nếu nhóm theo máy. */
  id: z.string().nullable(),
  name: z.string(),
  count: z.number(),
});
export type CuttingFileBreakdownRow = z.infer<typeof CuttingFileBreakdownRowZod>;

export const PreviewCuttingFilesZod = z.object({
  links: z.string().array().min(1).max(2000),
});
export class PreviewCuttingFilesDto extends createZodDto(extendApi(PreviewCuttingFilesZod)) {}

export const PreviewCuttingFilesResZod = ResZod.extend({
  data: z.object({
    matched: CuttingFileMatchedZod.array(),
    notFound: CuttingFileNotFoundZod.array(),
    invalid: CuttingFileInvalidZod.array(),
    /** Cùng 1 productionId xuất hiện ở > 1 link — user phải tự xóa bớt. */
    conflicts: CuttingFileConflictZod.array(),
    summary: z.object({
      totalLinks: z.number(),
      matched: z.number(),
      withExistingFile: z.number(),
      notFound: z.number(),
      invalid: z.number(),
      conflicts: z.number(),
      byFactory: CuttingFileBreakdownRowZod.array(),
      byMachineType: CuttingFileBreakdownRowZod.array(),
    }),
  }),
});
export class PreviewCuttingFilesResDto extends createZodDto(
  extendApi(PreviewCuttingFilesResZod),
) {}

export const ApplyCuttingFileItemZod = z.object({
  orderId: IDZod,
  cuttingFileUrl: z.string().min(1),
  cuttingFileName: z.string().min(1),
});

export const ApplyCuttingFilesZod = z.object({
  mappings: ApplyCuttingFileItemZod.array().min(1).max(2000),
  /** Cho phép ghi đè khi đơn đã có `cuttingFileUrl` cũ — default false. */
  overwrite: z.boolean().default(false),
});
export class ApplyCuttingFilesDto extends createZodDto(extendApi(ApplyCuttingFilesZod)) {}

export const ApplyCuttingFilesResZod = ResZod.extend({
  data: z.object({
    updated: z.number(),
    skipped: z.number(),
    skippedOrderIds: z.string().array(),
  }),
});
export class ApplyCuttingFilesResDto extends createZodDto(extendApi(ApplyCuttingFilesResZod)) {}
