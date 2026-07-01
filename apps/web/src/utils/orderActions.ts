import { DesignerStatus, FulfillmentStage, FulfillmentStageStatus } from 'shared';

/**
 * Đơn tối thiểu cần để quyết định quyền hủy. Khớp `WorkshopOrderRow` (+ mọi row
 * order khác) — chỉ đọc các field liên quan.
 */
export type CancellableOrder = {
  cancelledAt?: string | Date | null;
  designerStatus?: string;
  currentFulfillmentStage?: string | null;
  fulfillmentStages?: Record<string, { status?: string } | undefined>;
};

/** True nếu đơn đã bị hủy (soft). */
export const isCancelled = (o: { cancelledAt?: string | Date | null }): boolean => !!o.cancelledAt;

/**
 * Đơn có được HỦY không — MIRROR `OrderService.canCancelOrder` ở
 * `apps/api/src/modules/order/order.service.ts`. Sửa 1 nơi phải sửa cả 2.
 *
 * Cho hủy: chưa hủy sẵn, KHÔNG "cần làm lại" (rework), và chưa bắt đầu in
 * (chưa vào pipeline HOẶC đang ở Print status=`waiting`).
 * Chặn: đang in / đã in / qua In / rework / đã hủy.
 */
export function canCancelOrder(o: CancellableOrder): { ok: boolean; reason?: string } {
  if (o.cancelledAt) return { ok: false, reason: 'Đơn đã hủy.' };
  if (o.designerStatus === DesignerStatus.Rework)
    return { ok: false, reason: 'Đơn đang cần làm lại — không hủy được.' };
  const stage = o.currentFulfillmentStage;
  if (!stage) return { ok: true };
  if (stage !== FulfillmentStage.Print)
    return { ok: false, reason: 'Đơn đã qua công đoạn In — không hủy được.' };
  const printStatus = o.fulfillmentStages?.[FulfillmentStage.Print]?.status;
  if (printStatus === FulfillmentStageStatus.Waiting) return { ok: true };
  return { ok: false, reason: 'Đơn đã bắt đầu in — không hủy được.' };
}
