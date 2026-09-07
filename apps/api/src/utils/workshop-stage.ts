import { DesignerStatus, FULFILLMENT_STAGES } from 'shared';

/**
 * Biểu thức aggregation trả KHÓA CHẶNG hiện tại của đơn (`WORKSHOP_STAGE_FILTER_KEYS`):
 * MIRROR `computeCurrentStage()` (customer-order.service.ts) và `getOrderStatusInfo()`
 * (FE `orderStatusLabel.ts`). Dùng chung cho trang Đơn hàng theo xưởng (đếm phễu) và
 * CEO Dashboard (tồn theo chặng). Đổi luật ở đây phải đổi cả hai nơi kia.
 * CHỈ dùng trong aggregate — Mongoose không cast được `$switch` trong `$expr` của find.
 */
/** `prefix` = '$' cho document gốc; '$$p.' khi dùng trong `$map` trên mảng đơn đã `$lookup` (Seller Hub Operations). */
export function workshopStageSwitchExpr(prefix = '$'): Record<string, unknown> {
  const note = { $ifNull: [`${prefix}toolResultNote`, ''] };
  const ds = { $ifNull: [`${prefix}designerStatus`, DesignerStatus.Unassigned] };
  return {
    $switch: {
      branches: [
        { case: { $ne: [{ $ifNull: [`${prefix}fulfillmentCompletedAt`, null] }, null] }, then: 'done' },
        {
          case: { $in: [{ $ifNull: [`${prefix}currentFulfillmentStage`, ''] }, FULFILLMENT_STAGES] },
          then: `${prefix}currentFulfillmentStage`,
        },
        { case: { $eq: [ds, DesignerStatus.Done] }, then: 'print' },
        { case: { $ne: [ds, DesignerStatus.Unassigned] }, then: 'designer' },
        { case: { $eq: [note, ''] }, then: 'tool-check' },
      ],
      default: 'designer',
    },
  };
}
