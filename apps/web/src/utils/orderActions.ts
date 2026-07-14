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

/** True nếu đơn đang bị GIỮ (hold) — tạm dừng mọi thao tác tới khi mở lại. */
export const isHeld = (o: { heldAt?: string | Date | null }): boolean => !!o.heldAt;

/**
 * Role được phép giữ / mở giữ đơn — MIRROR `ORDER_WRITE_ROLES` ở
 * `apps/api/src/modules/order/order.controller.ts`. FE chỉ hiện nút cho các role
 * này; BE vẫn enforce lại (`@Auth(ORDER_WRITE_ROLES)`).
 */
export const HOLD_ALLOWED_ROLES = [
  'SuperAdmin',
  'Admin',
  'Manager',
  'Support',
  'DesignerLeader',
  'Fulfillment',
];

export const canUserHold = (roleName?: string): boolean =>
  !!roleName && HOLD_ALLOWED_ROLES.includes(roleName);

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
