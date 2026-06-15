import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { IDZod } from '..';

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

export const ProductionOrderZod = BaseEntityZod.extend({
  productionId: z.string().min(1),
  userSku: z.string().optional(),
  userEmail: z.string().optional(),
  type: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  mockupUrl: z.string().optional(),
  mockupOriginalUrl: z.string().optional(),
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

  // Workshop fields (Phase 2) — values are workshop_config codes
  printStatus: z.string().optional(),
  printStatusNote: z.string().optional(),
  toolResult: z.string().optional(),
  toolResultNote: z.string().optional(),
  errorFile: z.string().optional(),
  errorFileNote: z.string().optional(),
  assignee: z.string().optional(),
  assigneeNote: z.string().optional(),
  /** workshop_config code (category=fabric_type). Auto-filled at import from product config. */
  fabricType: z.string().optional(),

  // Derived: toolResultNote === 'ok'
  readyForFulfill: z.boolean().default(false),
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

  // Date range on createdAt (yyyy-mm-dd). Designer/Fulfillment have a server-
  // enforced "today only" default; passing these overrides UI date pickers.
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
export const UpdateOrderFieldZod = z.object({
  field: OrderWorkshopFieldZod,
  // string for select fields (code) or for the lone free-text errorFileNote.
  // Passing null/empty string clears the value.
  value: z.string().nullable(),
});
export class UpdateOrderFieldDto extends createZodDto(extendApi(UpdateOrderFieldZod)) {}

export const UpdateOrderFieldResZod = ResZod.extend({ data: ProductionOrderZod });
export class UpdateOrderFieldResDto extends createZodDto(extendApi(UpdateOrderFieldResZod)) {}

export const BulkUpdateOrderFieldZod = z.object({
  ids: IDZod.array().min(1),
  field: OrderWorkshopFieldZod,
  value: z.string().nullable(),
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
