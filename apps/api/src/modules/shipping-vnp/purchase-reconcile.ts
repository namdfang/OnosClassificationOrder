/**
 * Helper THUẦN cho luồng giữ chỗ khi mua label + cron đối soát record kẹt
 * `purchasing` (ShippingLabelPatterns.md §1 bước ⑤ + §8) — tách khỏi service
 * để test không cần DB/DI.
 *
 * Nguyên tắc §8: phân biệt 3 tình huống, tuyệt đối không gộp —
 * - hãng trả 404 = "hãng nói không có" → kết luận được (failed);
 * - 5xx / lỗi mạng = "không hỏi được" → KHÔNG kết luận gì (giữ purchasing);
 * - 200 với nội dung lạ = "đổi hợp đồng" → log nguyên văn, không kết luận.
 */

/** Record `purchasing` trẻ hơn ngưỡng này có thể là lượt mua ĐANG chạy thật — cron không đụng. */
export const RECONCILE_MIN_AGE_MS = 15 * 60 * 1000;
/** Trần record kẹt xử lý mỗi lượt cron (mỗi record = 1 call ra VNP). */
export const RECONCILE_BATCH = 50;

/** Dò sâu (BFS) giá trị string đầu tiên có key nằm trong danh sách ứng viên. */
export function digString(root: unknown, keys: string[]): string | undefined {
  const queue: unknown[] = [root];
  let guard = 0;
  while (queue.length > 0 && guard < 200) {
    guard += 1;
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    const rec = node as Record<string, unknown>;
    for (const key of keys) {
      const val = rec[key];
      if (typeof val === 'string' && val.trim()) return val;
      if (typeof val === 'number') return String(val);
    }
    for (const v of Object.values(rec)) {
      if (v && typeof v === 'object') queue.push(v);
    }
  }
  return undefined;
}

// Cùng danh sách key dò với shipping-vnp.service.ts (spec VNP không khai response).
const ID_KEYS = ['shipment_id', 'shipmentId', 'id', 'uuid'];
const TRACKING_KEYS = ['tracking_id', 'trackingId', 'tracking_code', 'trackingCode', 'tracking_number', 'trackingNumber'];
const LABEL_KEYS = ['image_url', 'label_url', 'labelUrl', 'label', 'label_pdf', 'labelPdf', 'label_link', 'pdf_url', 'pdfUrl'];

export type VnpLookupOutcome =
  | { kind: 'found'; shipmentId?: string; trackingCode?: string; labelUrl?: string }
  | { kind: 'not_found'; reason: string }
  | { kind: 'unknown'; reason: string };

const clip = (v: unknown): string => JSON.stringify(v ?? null).slice(0, 500);

/**
 * Phân loại kết quả probe VNP (getShipment / getByRef1) cho 1 record kẹt
 * `purchasing`. Chiều an toàn là chiều KHÔNG MẤT DẤU TIỀN: chỉ trả `not_found`
 * (→ đánh failed) khi hãng nói rõ không có; mọi ca mù mờ đều `unknown`
 * (giữ nguyên purchasing, lượt cron sau thử lại, ops thấy record kẹt mà soi).
 */
export function interpretVnpLookup(http: number | 'network', body: unknown): VnpLookupOutcome {
  if (http === 'network' || http >= 500) {
    return { kind: 'unknown', reason: `Không hỏi được VNP (${http})` };
  }
  if (http === 404) return { kind: 'not_found', reason: 'VNP trả 404 — không có shipment' };
  if (http >= 400) {
    // 4xx khác 404: có thể lỗi request/auth phía mình — chỉ kết luận khi
    // message nói rõ "not found".
    const msg = clip(body);
    if (/not\s*found|không tồn tại|no\s*shipment/i.test(msg)) return { kind: 'not_found', reason: msg };
    return { kind: 'unknown', reason: `VNP trả ${http}: ${msg}` };
  }

  // 2xx — format chuẩn VNP là {code, message, result} với code lồng bên trong.
  const rec = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof rec.code === 'number' && rec.code >= 400) {
    const msg = clip(body);
    if (rec.code === 404 || /not\s*found|không tồn tại|no\s*shipment/i.test(msg)) {
      return { kind: 'not_found', reason: msg };
    }
    return { kind: 'unknown', reason: msg };
  }
  // {code:200, result:[]/null} = tra theo mã mà danh sách rỗng → hãng nói không có.
  if (typeof rec.code === 'number' && 'result' in rec) {
    const result = rec.result;
    if (result === null || (Array.isArray(result) && result.length === 0)) {
      return { kind: 'not_found', reason: 'VNP trả result rỗng — không có shipment' };
    }
  }
  const shipmentId = digString(body, ID_KEYS);
  const trackingCode = digString(body, TRACKING_KEYS);
  if (shipmentId || trackingCode) {
    return { kind: 'found', shipmentId, trackingCode, labelUrl: digString(body, LABEL_KEYS) };
  }
  // 200 nhưng không dò ra gì và không khớp format chuẩn = "đổi hợp đồng" —
  // log nguyên văn, KHÔNG đánh failed (thà kẹt còn hơn mất dấu label thật).
  return { kind: 'unknown', reason: '200 nhưng không dò ra shipment id/tracking: ' + clip(body) };
}
