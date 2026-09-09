import type { CustomerShipMethod, SellerShipErrorCode } from 'shared';
import { hasProductionOrderTracking, type ProductionOrderTracking } from 'shared';

/**
 * Điều kiện SELLER được tự mua label cho 1 đơn — hàm THUẦN tách khỏi service
 * để test không cần DB. Đã chốt với user (plan SellerWallet-LabelPurchase §1):
 * CHỈ đơn cod/tiktok (giá sản phẩm chưa gồm ship); express_us/economy_us ship
 * đã nằm trong retailPrice và admin là người mua label → cho seller mua nữa
 * là trả ship 2 lần.
 */
export interface SellerLabelStagingInput {
  customerId: string;
  pushedAt?: Date | null;
  status?: string;
  items: Array<{ shipMethod?: CustomerShipMethod; productionId?: string; tracking?: ProductionOrderTracking }>;
}

export interface SellerLabelProductionInput {
  heldAt?: Date | null;
  cancelledAt?: Date | null;
  tracking?: ProductionOrderTracking;
  vnpShipment?: { shipmentId?: string; cancelledAt?: Date | null } | null;
}

export type SellerLabelEligibility = { ok: true } | { ok: false; errorCode: SellerShipErrorCode };

export function checkSellerLabelEligibility(
  requesterCustomerId: string,
  staging: SellerLabelStagingInput,
  productionOrders: SellerLabelProductionInput[],
): SellerLabelEligibility {
  // Ownership — sai chủ trả `not_eligible` (KHÔNG lộ đơn tồn tại hay không).
  if (String(staging.customerId) !== String(requesterCustomerId)) return { ok: false, errorCode: 'not_eligible' };
  if (staging.status === 'cancelled') return { ok: false, errorCode: 'not_eligible' };
  // Phải đã đẩy sản xuất — trước đó địa chỉ/nhóm production chưa chốt.
  if (!staging.pushedAt) return { ok: false, errorCode: 'not_eligible' };
  if (staging.items.length === 0) return { ok: false, errorCode: 'not_eligible' };

  // MỌI item phải là cod/tiktok; lẫn express → từ chối cả nhóm.
  const allNonShip = staging.items.every((it) => it.shipMethod === 'cod' || it.shipMethod === 'tiktok');
  if (!allNonShip) return { ok: false, errorCode: 'not_eligible' };

  // Đã có tracking ở BẤT KỲ đâu (tự cấp trên staging, snapshot trên production,
  // hay label VNP còn hiệu lực) → 1 đơn chỉ 1 label.
  if (staging.items.some((it) => hasProductionOrderTracking(it.tracking))) {
    return { ok: false, errorCode: 'already_has_label' };
  }
  if (staging.items.some((it) => !it.productionId)) return { ok: false, errorCode: 'not_eligible' };
  if (productionOrders.length === 0) return { ok: false, errorCode: 'not_eligible' };
  for (const o of productionOrders) {
    if (o.cancelledAt || o.heldAt) return { ok: false, errorCode: 'not_eligible' };
    if (hasProductionOrderTracking(o.tracking)) return { ok: false, errorCode: 'already_has_label' };
    if (o.vnpShipment?.shipmentId && !o.vnpShipment.cancelledAt) return { ok: false, errorCode: 'already_has_label' };
  }
  return { ok: true };
}

/**
 * Cân prefill + kích thước quy đổi từ biến thể của CẢ nhóm item:
 * cân thật = Σ(weight×qty); cân quy đổi cộng theo THỂ TÍCH Σ(dài×rộng×cao×qty)
 * — kiện nhiều item không có "1 bộ kích thước" đúng, cộng thể tích là xấp xỉ
 * nhất quán duy nhất tính được từ dữ liệu biến thể.
 */
export function sumStagingWeights(
  items: Array<{ quantity?: number; weight?: number; width?: number; height?: number; length?: number }>,
): { prefillGram: number; totalVolumeCm3: number } {
  let prefillGram = 0;
  let totalVolumeCm3 = 0;
  for (const it of items) {
    const qty = it.quantity && it.quantity > 0 ? it.quantity : 1;
    if (it.weight && it.weight > 0) prefillGram += it.weight * qty;
    if (it.length && it.width && it.height && it.length > 0 && it.width > 0 && it.height > 0) {
      totalVolumeCm3 += it.length * it.width * it.height * qty;
    }
  }
  return { prefillGram: Math.ceil(prefillGram), totalVolumeCm3 };
}
