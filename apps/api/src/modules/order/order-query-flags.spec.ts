import { GetProductionOrdersZod } from 'shared';

/**
 * `ORD-21` — cờ `includeExcludedFactory` quyết định đơn xưởng US có lọt vào
 * danh sách hay không. Sai ở đây KHÔNG báo lỗi, chỉ ra danh sách thừa hoặc
 * thiếu — nên luật phân giải phải được khoá bằng test.
 *
 * Lỗi gốc: `z.coerce.boolean()` theo luật truthy của JavaScript, nên mọi chuỗi
 * khác rỗng đều thành `true`, kể cả `'false'`. TEST đo trên API thật: gửi
 * `false` trả về 39.906 đơn (GỘP đơn xưởng US) thay vì 39.606.
 */
const parseFlag = (raw?: string) => {
  const query: Record<string, unknown> = { page: 1, limit: 20 };
  if (raw !== undefined) query.includeExcludedFactory = raw;
  return GetProductionOrdersZod.parse(query).includeExcludedFactory;
};

describe('ORD-21 — cờ includeExcludedFactory phân giải boolean', () => {
  it('BẬT với đúng hai giá trị mang nghĩa đúng', () => {
    expect(parseFlag('true')).toBe(true);
    expect(parseFlag('1')).toBe(true);
  });

  it('TẮT với giá trị mang nghĩa sai — đây là ca từng hỏng', () => {
    expect(parseFlag('false')).toBe(false);
    expect(parseFlag('0')).toBe(false);
  });

  it('giá trị không hiểu được thì TẮT, chọn phía giấu bớt chứ không lộ thêm', () => {
    for (const raw of ['no', 'abc', '2', 'TRUE ', 'yes']) {
      // 'TRUE ' có khoảng trắng vẫn bật được vì đã trim + hạ chữ thường.
      expect(parseFlag(raw)).toBe(raw.trim().toLowerCase() === 'true');
    }
    expect(parseFlag('no')).toBe(false);
    expect(parseFlag('2')).toBe(false);
  });

  it('không gửi cờ hoặc gửi rỗng thì giữ nguyên nghĩa optional', () => {
    expect(parseFlag(undefined)).toBeUndefined();
    expect(parseFlag('')).toBeUndefined();
  });

  it('không ném lỗi với giá trị lạ — báo 400 sẽ làm hỏng nơi đang lỡ gửi', () => {
    expect(() => parseFlag('không-phải-boolean')).not.toThrow();
  });

  it('chỉ `=== true` mới mở, nên mọi giá trị tắt đều rơi về nhánh mặc định', () => {
    // Service kiểm bằng `dto?.includeExcludedFactory === true`. Ca này khoá
    // giao kèo đó: không giá trị tắt nào được là truthy.
    for (const raw of [undefined, '', 'false', '0', 'no', 'abc']) {
      expect(parseFlag(raw) === true).toBe(false);
    }
  });
});
