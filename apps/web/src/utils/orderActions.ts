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
 * Admin được hủy đơn ở **BẤT KỲ trạng thái nào** (đã in/ép/may/rework…) — chỉ
 * chặn đơn ĐÃ hủy sẵn (không hủy 2 lần). Action đã Admin-only ở BE.
 */
export function canCancelOrder(o: CancellableOrder): { ok: boolean; reason?: string } {
  if (o.cancelledAt) return { ok: false, reason: 'Đơn đã hủy.' };
  return { ok: true };
}
