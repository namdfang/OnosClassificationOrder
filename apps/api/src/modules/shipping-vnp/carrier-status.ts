/**
 * Trạng thái HÃNG — tách khỏi trạng thái MUA (ShippingLabelPatterns.md §3).
 * Helper THUẦN cho cron poll tracking + nút tra tay: từ response tracking thô
 * dựng patch các field phía hãng (`lastTrackingStatus` ≡ carrierStatus,
 * `lastTrackingAt` ≡ carrierSyncedAt, `scannedAt`, `carrierNote`) — test không
 * cần DB/DI.
 */

import { digString } from './purchase-reconcile';

export const STATUS_KEYS = ['status', 'shipment_status', 'tracking_status', 'state'];

// Ghi chú/lý do từ hãng để ops cứu đơn (vd nghi địa chỉ sai). CỐ Ý không có
// 'message' — VNP nhét message generic ("success", lỗi wrap...) vào đó.
const NOTE_KEYS = ['note', 'carrier_note', 'carrierNote', 'reason', 'failure_reason', 'warning'];

/**
 * Text trạng thái mang nghĩa "CHƯA có thông tin" — không được tính là tín hiệu
 * label đã vào mạng lưới (publicTrack trả 400 "No tracking information..." cho
 * label chưa scan; phòng cả trường hợp shape sau này trả text này ở field status).
 */
const NO_SIGNAL_RE = /no\s*tracking|not\s*found|kh[oô]ng\s*(c[oó]\s*)?th[oô]ng\s*tin/i;

/**
 * Phân loại text tracking → phase tổng hợp cho status record. Shape response
 * khi hàng chạy thật CHƯA biết (label test chưa từng được scan) — chỉ nhận
 * diện chuỗi chắc chắn, còn lại coi là đang vận chuyển; bổ sung map khi có
 * đơn thật đầu tiên.
 */
export function classifyTrackingStatus(text?: string): 'in_transit' | 'delivered' | undefined {
  if (!text?.trim()) return undefined;
  if (NO_SIGNAL_RE.test(text)) return undefined;
  if (/delivered|đã giao/i.test(text)) return 'delivered';
  return 'in_transit';
}

/**
 * Response chứa NHÁNH LỖI của hãng/nguồn tracking không — VNP hay trả
 * `{code:200, result:{error:{name, message, status:500}}}` (vd cạn quota USPS
 * Web Tools). Với response lỗi thì KHÔNG được đọc bất kỳ trường nào làm
 * trạng thái: đã dính thật 2026-09-05 — `error.status: 500` bị digString nhặt
 * làm text tracking → set scannedAt oan cho label chưa từng được quét.
 */
export function hasCarrierError(root: unknown): boolean {
  const queue: unknown[] = [root];
  let guard = 0;
  while (queue.length > 0 && guard < 200) {
    guard += 1;
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    const rec = node as Record<string, unknown>;
    if (rec.error) return true;
    for (const v of Object.values(rec)) {
      if (v && typeof v === 'object') queue.push(v);
    }
  }
  return false;
}

/**
 * Nhặt text trạng thái tracking — KHÁC digString ở 2 điểm sống còn:
 * (1) CHỈ nhận giá trị string — status dạng SỐ là HTTP code/mã lỗi, không bao
 * giờ là text trạng thái của hãng; (2) KHÔNG đi vào nhánh `error` của response.
 */
export function extractStatusText(root: unknown): string | undefined {
  const queue: unknown[] = [root];
  let guard = 0;
  while (queue.length > 0 && guard < 200) {
    guard += 1;
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    const rec = node as Record<string, unknown>;
    for (const key of STATUS_KEYS) {
      const val = rec[key];
      if (typeof val === 'string' && val.trim()) return val;
    }
    for (const [key, v] of Object.entries(rec)) {
      if (key === 'error') continue;
      if (v && typeof v === 'object') queue.push(v);
    }
  }
  return undefined;
}

/**
 * Response tracking có TÍN HIỆU label đã vào mạng lưới không — chốt ① của
 * luồng hủy fail-closed (§4): có tín hiệu = đã quét = TỪ CHỐI hủy.
 * Response lỗi (quota/provider chết) = KHÔNG BIẾT, không phải "chưa quét" —
 * caller phải tự kiểm `hasCarrierError` để đi nhánh fail-closed.
 */
export function hasCarrierSignal(raw: unknown): boolean {
  if (hasCarrierError(raw)) return false;
  const text = extractStatusText(raw);
  return !!text && !NO_SIGNAL_RE.test(text);
}

/**
 * Text trạng thái hãng xác nhận label ĐÃ CHẾT (đã hủy) — cron dọn record kẹt
 * `cancelling` dùng để chốt sổ. Chỉ nhận diện chuỗi chắc chắn; shape thật của
 * label hủy CHƯA đo được (bổ sung khi có ca thật đầu tiên).
 */
export function isCancelledStatusText(text?: string): boolean {
  if (!text?.trim()) return false;
  return /cancel|void|đã hủy|huỷ/i.test(text);
}

export interface CarrierPatchInput {
  /** Text trạng thái hãng lần trước (so để biết ĐỔI → ghi trackingEvents). */
  lastTrackingStatus?: string;
  /** Đã từng ghi nhận label vào mạng lưới chưa — có rồi thì KHÔNG set lại. */
  scannedAt?: Date | null;
  /** Status record hiện tại — chỉ đổi khi phase suy ra khác. */
  status: string;
}

export interface CarrierPatch {
  /** $set fragment cho record `shipments` (callsite tự thêm $push trackingEvents khi changed). */
  set: Record<string, unknown>;
  /** Status text ĐỔI so với lần trước → ghi event + sync snapshot orders. */
  changed: boolean;
  statusText?: string;
  newStatus?: 'in_transit' | 'delivered';
}

/**
 * Dựng patch phía hãng từ response tracking thô. Luật:
 * - `scannedAt` set đúng 1 LẦN — lần đầu có tín hiệu trạng thái thật từ hãng
 *   (text "no tracking information" KHÔNG tính). Chiều an toàn của §4: nghi
 *   ngờ đã quét thì coi là đã quét (mất tiện hủy, không mất hàng).
 * - `carrierNote` ghi khi hãng trả note/reason — ops đọc để cứu đơn.
 * - `status` chỉ đề xuất đổi sang phase suy ra (in_transit/delivered) khi khác
 *   hiện tại; callsite chịu trách nhiệm chỉ áp lên record created/in_transit.
 */
export function buildCarrierPatch(doc: CarrierPatchInput, raw: unknown, now: Date): CarrierPatch {
  // Response lỗi (quota/provider chết) → KHÔNG đọc gì làm trạng thái, chỉ ghi
  // mốc sync — coi như lượt hỏi thất bại, không phải "hãng nói gì đó".
  if (hasCarrierError(raw)) {
    return { set: { lastTrackingAt: now }, changed: false };
  }
  const statusText = extractStatusText(raw);
  const isSignal = !!statusText && !NO_SIGNAL_RE.test(statusText);
  const noteText = digString(raw, NOTE_KEYS);
  const changed = !!statusText && statusText !== doc.lastTrackingStatus;
  const newStatus = classifyTrackingStatus(statusText);
  return {
    set: {
      lastTrackingAt: now,
      ...(statusText ? { lastTrackingStatus: statusText } : {}),
      ...(newStatus && newStatus !== doc.status ? { status: newStatus } : {}),
      ...(isSignal && !doc.scannedAt ? { scannedAt: now } : {}),
      ...(noteText ? { carrierNote: noteText } : {}),
    },
    changed,
    statusText,
    newStatus,
  };
}
