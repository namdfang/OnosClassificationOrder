import { DesignerStatus, FULFILLMENT_STAGES } from 'shared';

/**
 * Biểu thức aggregation trả KHÓA CHẶNG hiện tại của đơn (`WORKSHOP_STAGE_FILTER_KEYS`):
 * MIRROR `computeCurrentStage()` (customer-order.service.ts) và `getOrderStatusInfo()`
 * (FE `orderStatusLabel.ts`). Dùng chung cho trang Đơn hàng theo xưởng (đếm phễu) và
 * CEO Dashboard (tồn theo chặng). Đổi luật ở đây phải đổi cả hai nơi kia.
 * CHỈ dùng trong aggregate — Mongoose không cast được `$switch` trong `$expr` của find.
 */
export function workshopStageSwitchExpr(): Record<string, unknown> {
  const note = { $ifNull: ['$toolResultNote', ''] };
  const ds = { $ifNull: ['$designerStatus', DesignerStatus.Unassigned] };
  return {
    $switch: {
      branches: [
        { case: { $ne: [{ $ifNull: ['$fulfillmentCompletedAt', null] }, null] }, then: 'done' },
        {
          case: { $in: [{ $ifNull: ['$currentFulfillmentStage', ''] }, FULFILLMENT_STAGES] },
          then: '$currentFulfillmentStage',
        },
        { case: { $eq: [ds, DesignerStatus.Done] }, then: 'print' },
        { case: { $ne: [ds, DesignerStatus.Unassigned] }, then: 'designer' },
        { case: { $eq: [note, ''] }, then: 'tool-check' },
      ],
      default: 'designer',
    },
  };
}
