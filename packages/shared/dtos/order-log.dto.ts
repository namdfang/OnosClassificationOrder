import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { BaseEntityZod, PageQueryZod, PageResZod } from '@shared/types';

export const ORDER_LOG_ACTIONS = ['create', 'update', 'delete', 'import', 'bulk_update', 'transfer', 'cancel', 'update_design', 'hold', 'unhold'] as const;
export type ProductionOrderLogAction = (typeof ORDER_LOG_ACTIONS)[number];
export const ProductionOrderLogActionZod = z.enum(ORDER_LOG_ACTIONS);

export const ProductionOrderLogZod = BaseEntityZod.extend({
  orderId: z.string().min(1),
  userId: z.string().optional(),
  userName: z.string().optional(),    // snapshot fullName
  userEmail: z.string().optional(),   // snapshot email
  roleCode: z.string().optional(),    // snapshot role.name
  action: ProductionOrderLogActionZod,
  field: z.string().optional(),       // field name khi action = update/bulk_update
  before: z.any().optional(),
  after: z.any().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});
export type ProductionOrderLog = z.infer<typeof ProductionOrderLogZod>;

//
export const GetOrderLogsZod = PageQueryZod.extend({
  action: ProductionOrderLogActionZod.optional(),
  field: z.string().optional(),
});
export class GetOrderLogsDto extends createZodDto(extendApi(GetOrderLogsZod)) {}

export const GetOrderLogsResZod = PageResZod.extend({ data: ProductionOrderLogZod.array() });
export class GetOrderLogsResDto extends createZodDto(extendApi(GetOrderLogsResZod)) {}
