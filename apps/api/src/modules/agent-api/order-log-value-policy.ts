import { maskFreeTextDeep } from './mask-free-text';

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
 * 3. Còn lại → trả về, nhưng chuỗi vẫn phải đi qua bộ che theo mẫu. Hai tên
 *    trong danh sách trắng là văn bản gõ tay (`cancelReason`, `holdReason`)
 *    nên bước này bắt buộc.
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
  if (before !== undefined) out.before = maskFreeTextDeep(before);
  if (after !== undefined) out.after = maskFreeTextDeep(after);
  return out;
}
