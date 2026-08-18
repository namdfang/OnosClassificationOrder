/**
 * Giá trị cũ/mới trong nhật ký đơn (`API-1`, AC-17).
 *
 * Danh sách trắng dưới đây **do BA chốt**, không phải DEV đề xuất — SRS
 * `.devtasks/srs/API-1.md` BR-4a §5a, đúng 17 tên. Đây là quyết định phơi lộ
 * dữ liệu nên thuộc BA; sửa nó phải qua BA, và bất biến I7 khoá cứng con số 17
 * trong unit test để không ai nới lặng lẽ.
 */
export const ORDER_LOG_VALUE_WHITELIST = [
  'printStatus',
  'toolResult',
  'errorFile',
  'fabricType',
  'machineNumber',
  'productionError',
  'productionErrorSource',
  'priority',
  'type',
  'color',
  'size',
  'quantity',
  'factoryId',
  'cancelledAt',
  'cancelReason',
  'heldAt',
  'holdReason',
] as const;

const WHITELIST = new Set<string>(ORDER_LOG_VALUE_WHITELIST);

const isPrimitive = (v: unknown): boolean =>
  v === null || ['string', 'number', 'boolean'].includes(typeof v) || v instanceof Date;

export type OrderLogValueResult = { before?: unknown; after?: unknown; valueOmitted?: true };

/**
 * Quyết định `before`/`after` của MỘT dòng nhật ký, theo đúng thứ tự của
 * `.devtasks/design/API-1.md` §7.5:
 *
 * 1. `field` rỗng hoặc ngoài danh sách trắng → lược giá trị, đặt `valueOmitted`
 *    để agent biết là bị lược chứ không phải giá trị vốn rỗng.
 * 2. Giá trị là object hoặc mảng → lược như trên. `before`/`after` kiểu tuỳ ý
 *    nên không kiểm được nội dung lồng nhau theo tên trường.
 * 3. Còn lại → trả về NGUYÊN VĂN.
 *
 * Bước che theo mẫu ở mục 3 đã bị bỏ (`API-12`). `API-11` bỏ che cho trường văn
 * bản tự do nhưng chỗ này còn che, tạo ra một sự bất nhất mà agent không có cách
 * nào hiểu: nội dung hiện tại của một ghi chú thì nguyên văn, còn LỊCH SỬ THAY
 * ĐỔI của chính ghi chú đó lại là bản đã che. Cùng một nội dung, hai câu trả lời
 * khác nhau tuỳ đường hỏi — agent sẽ tưởng dữ liệu hỏng hoặc tưởng ghi chú đã bị
 * sửa.
 *
 * Danh sách trắng 17 tên **không đổi**: bỏ che và nới danh sách là hai chuyện
 * khác nhau, và chỉ chuyện thứ nhất được yêu cầu. Hai tên trong danh sách là văn
 * bản gõ tay (`cancelReason`, `holdReason`) — đó chính là chỗ email/điện thoại
 * có thể xuất hiện, và nay chúng đi ra nguyên vẹn.
 */
export function applyOrderLogValuePolicy(
  field: unknown,
  before: unknown,
  after: unknown,
): OrderLogValueResult {
  if (typeof field !== 'string' || !WHITELIST.has(field)) return { valueOmitted: true };
  if (!isPrimitive(before) && before !== undefined) return { valueOmitted: true };
  if (!isPrimitive(after) && after !== undefined) return { valueOmitted: true };

  const out: OrderLogValueResult = {};
  if (before !== undefined) out.before = before;
  if (after !== undefined) out.after = after;
  return out;
}
