import { ordersRegistry } from './registry/orders.registry';

/**
 * Giá trị cũ/mới trong nhật ký đơn (`API-1` AC-17, nới ở `API-17`).
 *
 * Trước `API-17` đây là danh sách **17 tên chép tay** do BA chốt. Nay bề mặt dữ
 * liệu mở rộng nên danh sách đó trở thành ảnh chụp của một thời điểm đã qua — và
 * nó đã trôi khỏi thực tế **một lần rồi**. Thay vì chép tay lần thứ hai, danh sách
 * nay **suy ra từ registry `orders`**: đúng những tên trường có `read: true`.
 *
 * Đây VẪN LÀ DANH SÁCH TRẮNG, không phải danh sách đen — điểm BA lo khi từ chối
 * mở thẳng `before`/`after`: tám trường tiền không bao giờ lọt vào vì chúng không
 * có `read: true` ở đâu cả. Trường mới chỉ xuất hiện ở đây khi có người CỐ Ý mở
 * nó trong registry, và bất biến I4 canh việc đó.
 */
export const ORDER_LOG_VALUE_WHITELIST = Object.entries(ordersRegistry.fields)
  .filter(([, policy]) => policy.read)
  .map(([name]) => name);

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
 * Quy tắc 2 giữ nguyên sau `API-17` dù registry `orders` nay có trường kiểu
 * khối (địa chỉ giao, các chặng xưởng): giá trị lịch sử của chúng vẫn bị lược, vì
 * `before`/`after` kiểu tuỳ ý nên không kiểm được nội dung lồng nhau theo tên
 * trường. Đọc ĐƯỢC trường ở bản ghi hiện tại khác với đọc được LỊCH SỬ THAY
 * ĐỔI của nó.
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
