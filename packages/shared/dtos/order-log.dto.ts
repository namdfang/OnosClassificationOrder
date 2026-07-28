import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

export const ORDER_LOG_ACTIONS = [
  'create',
  'update',
  'delete',
  'import',
  'bulk_update',
  'transfer',
  'cancel',
  'update_design',
  'hold',
  'unhold',
] as const;
export type ProductionOrderLogAction = (typeof ORDER_LOG_ACTIONS)[number];
export const ProductionOrderLogActionZod = z.enum(ORDER_LOG_ACTIONS);

export const ProductionOrderLogZod = BaseEntityZod.extend({
  orderId: z.string().min(1),
  userId: z.string().optional(),
  userName: z.string().optional(), // snapshot fullName
  userEmail: z.string().optional(), // snapshot email
  roleCode: z.string().optional(), // snapshot role.name
  action: ProductionOrderLogActionZod,
  field: z.string().optional(), // field name khi action = update/bulk_update
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

//
// Data-fix 1 lần — xóa log "gán design" (field=assignee) bị ghi SAI trong ngày
// hôm nay cho 1 sản phẩm (vd do bug auto-assign). KHÔNG đụng field `assignee`
// thật trên đơn — chỉ xóa audit log. `productionId` để test trên đúng 1 đơn
// thay vì cả loạt theo `type`. Xem `OrderService.fixAssignDesignLog()`.
export const FixAssignDesignLogZod = z
  .object({
    /** Tên sản phẩm — khớp `order.type` case-insensitive (giống ProductConfig.fullName lúc import). */
    type: z.string().min(1).max(300).optional(),
    /** Test trên đúng 1 đơn — bỏ qua lọc theo `type`/trong ngày khi tìm đơn (log vẫn chỉ xóa trong ngày). */
    productionId: z.string().min(1).max(100).optional(),
  })
  .refine((d) => !!d.type?.trim() || !!d.productionId?.trim(), {
    message: 'Cần truyền type hoặc productionId',
  });
export class FixAssignDesignLogDto extends createZodDto(extendApi(FixAssignDesignLogZod)) {}

export const FixAssignDesignLogResZod = ResZod.extend({
  data: z.object({
    matchedOrders: z.number().int().nonnegative(),
    deletedLogs: z.number().int().nonnegative(),
    orderIds: z.string().array(),
  }),
});
export class FixAssignDesignLogResDto extends createZodDto(extendApi(FixAssignDesignLogResZod)) {}
