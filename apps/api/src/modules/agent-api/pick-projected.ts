type Row = Record<string, unknown>;

/**
 * Giữ lại đúng những khoá đã xin trong `$project`, kể cả khoá là **đường dẫn
 * lồng** dạng `variations.sku` (`QA-1`).
 *
 * Vì sao cần hàm này thay vì `row[key]`: mongo chiếu `{'variations.sku': 1}` và
 * trả về `{ variations: [{ sku }] }` — hình MẢNG, không phải một khoá tên
 * `'variations.sku'`. Bản cũ đọc thẳng `row['variations.sku']` nên luôn nhận
 * `undefined` và **im lặng** vứt bỏ toàn bộ dữ liệu biến thể: agent thấy sản
 * phẩm không có biến thể nào, không lỗi, không cảnh báo.
 *
 * Bước lọc này tồn tại để bỏ các khoá chỉ MƯỢN để tính chính sách
 * (`before`/`after` của `orderLogs`, xem `order-log-value-policy.ts`) — nên nó
 * không được phép nới thành "trả nguyên khối `variations`": mỗi phần tử mảng
 * chỉ giữ đúng các trường con nằm trong danh sách trắng.
 */
export function pickProjected(row: Row, projection: Record<string, 1>): Row {
  const out: Row = {};
  for (const key of Object.keys(projection)) {
    assignPath(out, row, key.split('.'));
  }
  return out;
}

function assignPath(out: Row, source: Row, parts: string[]): void {
  const [head, ...rest] = parts;
  const value = source?.[head];
  if (value === undefined) return;

  if (rest.length === 0) {
    out[head] = value;
    return;
  }

  // Mảng subdoc (`variations`): đi vào từng phần tử, giữ nguyên độ dài mảng —
  // số biến thể là thông tin thật, kể cả khi phần tử không có trường nào được xin.
  if (Array.isArray(value)) {
    const target = Array.isArray(out[head]) ? (out[head] as Row[]) : value.map(() => ({}) as Row);
    value.forEach((element, i) => {
      target[i] ??= {};
      assignPath(target[i], element as Row, rest);
    });
    out[head] = target;
    return;
  }

  if (typeof value === 'object' && value !== null) {
    const existing = out[head];
    const target = existing && typeof existing === 'object' && !Array.isArray(existing) ? (existing as Row) : {};
    assignPath(target, value as Row, rest);
    out[head] = target;
  }
}
