/**
 * Điều kiện tự động mua label VNP khi đơn hoàn thành Đóng hàng — hàm THUẦN
 * (test không cần DB/DI). Phạm vi chốt với user 2026-09-07:
 * - CHỈ đơn lên qua Customer Portal (có item trong staging `customer_orders`)
 *   — đơn import nội bộ (OnosPod) không có shipMethod → bỏ qua.
 * - shipMethod thuộc AUTO_PURCHASE_SHIP_METHODS (express_us/economy_us — giá
 *   đã gồm ship, bên mình chịu trách nhiệm mua label). cod/tiktok (SBTT) là
 *   khách tự lo label → bỏ qua.
 * - Nhóm (cùng orderId seller — 1 đơn 1 label) không item nào có tracking
 *   khách tự cấp (ORD-26), không item nào có vận đơn active, và TẤT CẢ item
 *   đã hoàn thành Đóng hàng (item cuối cùng pack xong mới mua — label gộp cả
 *   nhóm, mua sớm là label chứa item chưa đóng).
 */

import { AUTO_PURCHASE_SHIP_METHODS } from 'shared';

export interface AutoPurchaseGroupItem {
  productionId: string;
  /** Đã có tracking khách tự cấp (ORD-26) — nhóm có 1 item là bỏ cả nhóm. */
  hasTracking: boolean;
  /** Đã có vận đơn VNP active (chưa hủy). */
  hasActiveShipment: boolean;
  /** `fulfillmentCompletedAt` — thiếu = item chưa đóng hàng xong. */
  completedAt?: Date | null;
}

/**
 * Lý do BỎ QUA (string để log soi được vì fail chỉ log không retry) — `null`
 * nghĩa là đủ điều kiện mua.
 */
export function autoPurchaseSkipReason(input: {
  enabled: boolean;
  /** shipMethod của item staging khớp productionId — undefined = đơn không qua portal. */
  shipMethod?: string;
  group: AutoPurchaseGroupItem[];
}): string | null {
  if (!input.enabled) return 'disabled';
  if (!input.shipMethod) return 'not-portal-order';
  if (!(AUTO_PURCHASE_SHIP_METHODS as readonly string[]).includes(input.shipMethod)) {
    return `ship-method:${input.shipMethod}`;
  }
  if (input.group.length === 0) return 'empty-group';
  const withTracking = input.group.find((i) => i.hasTracking);
  if (withTracking) return `has-tracking:${withTracking.productionId}`;
  const withShipment = input.group.find((i) => i.hasActiveShipment);
  if (withShipment) return `has-shipment:${withShipment.productionId}`;
  const incomplete = input.group.find((i) => !i.completedAt);
  if (incomplete) return `group-incomplete:${incomplete.productionId}`;
  return null;
}

/**
 * requestId idempotency cho lượt mua auto — CỐ ĐỊNH theo nhóm (không random):
 * hook bắn lặp (restart giữa chừng, 2 item cùng nhóm pack sát nhau lọt qua
 * check group-incomplete) thì unique index `purchaseKey` quy mọi lượt về đúng
 * 1 label (ShippingLabelPatterns.md §2/§5 — job auto BẮT BUỘC gửi requestId).
 */
export function autoPurchaseRequestId(groupKey: string): string {
  return `auto:pack:${groupKey}`;
}
