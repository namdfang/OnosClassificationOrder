import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { IDZod } from '@shared/constants';
import { ResZod } from '@shared/types';

//
// Status overview query — superset of order list filters.
//
export const GetOrderStatusOverviewZod = z.object({
  printStatus: z.string().optional(),
  printStatusNote: z.string().optional(),
  toolResult: z.string().optional(),
  toolResultNote: z.string().optional(),
  errorFile: z.string().optional(),
  assignee: z.string().optional(),
  assigneeNote: z.string().optional(),
  /** Comma-separated workshop_config codes for production_error. */
  productionError: z.string().optional(),
  /** true → chỉ lấy đơn có lỗi xưởng. false → chỉ đơn không lỗi. */
  hasError: z.coerce.boolean().optional(),
  factoryId: IDZod.optional(),
  machineTypeId: IDZod.optional(),
  readyForFulfill: z.coerce.boolean().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  search: z.string().optional(),
});
export class GetOrderStatusOverviewDto extends createZodDto(extendApi(GetOrderStatusOverviewZod)) {}

//
// Breakdown bucket — one bar in a breakdown card.
//
const BreakdownBucketZod = z.object({
  code: z.string().nullable(), // null = "chưa phân loại"
  name: z.string(),
  count: z.number(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const FactoryBucketZod = z.object({
  factoryId: z.string().nullable(),
  name: z.string(),
  count: z.number(),
});

const MachineBucketZod = z.object({
  machineTypeId: z.string().nullable(),
  name: z.string(),
  count: z.number(),
});

const ReadyBucketZod = z.object({
  key: z.boolean(),
  count: z.number(),
});

const MachineKpiZod = z.object({
  machineCode: z.string(),
  machineName: z.string(),
  printed: z.number(),
  pending: z.number(),
});

export const OrderStatusOverviewZod = z.object({
  totals: z.object({
    total: z.number(),
    today: z.number(),
    pendingToolOk: z.number(),
    readyForFulfill: z.number(),
    done: z.number(),
    errors: z.number(),
    byMachine: MachineKpiZod.array().optional(),
  }),
  breakdown: z.object({
    printStatus: BreakdownBucketZod.array(),
    printStatusNote: BreakdownBucketZod.array(),
    toolResult: BreakdownBucketZod.array(),
    toolResultNote: BreakdownBucketZod.array(),
    errorFile: BreakdownBucketZod.array(),
    productionError: BreakdownBucketZod.array(),
    assignee: BreakdownBucketZod.array(),
    assigneeNote: BreakdownBucketZod.array(),
    factory: FactoryBucketZod.array(),
    machineType: MachineBucketZod.array(),
    readyForFulfill: ReadyBucketZod.array(),
  }),
  filter: GetOrderStatusOverviewZod,
});
export type OrderStatusOverview = z.infer<typeof OrderStatusOverviewZod>;
export type BreakdownBucket = z.infer<typeof BreakdownBucketZod>;
export type FactoryBucket = z.infer<typeof FactoryBucketZod>;
export type MachineBucket = z.infer<typeof MachineBucketZod>;
export type MachineKpi = z.infer<typeof MachineKpiZod>;

export const GetOrderStatusOverviewResZod = ResZod.extend({ data: OrderStatusOverviewZod });
export class GetOrderStatusOverviewResDto extends createZodDto(extendApi(GetOrderStatusOverviewResZod)) {}
