import { GetFactoryOverviewZod, GetProductionOrdersZod } from 'shared';

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


/**
 * `ORD-23` — sáu cờ quyết định ĐƠN NÀO HIỆN RA, cùng bẫy như trên. Đo trước khi
 * sửa: gửi `false` cho `unmapped` trả về **0 đơn** (tập đơn chưa map xưởng)
 * thay vì cả 39.606 — nó ĐẢO HẲN tập kết quả chứ không chỉ nới thêm.
 */
const SIX_FLAGS = ['unmapped', 'cancelled', 'held', 'hasError', 'designBacklog', 'needDesigner'] as const;

const parseNamed = (flag: string, raw?: string): boolean | undefined => {
  const query: Record<string, unknown> = { page: 1, limit: 20 };
  if (raw !== undefined) query[flag] = raw;
  return (GetProductionOrdersZod.parse(query) as Record<string, unknown>)[flag] as boolean | undefined;
};

describe('ORD-23 — sáu cờ quyết định đơn nào hiện ra', () => {
  it.each(SIX_FLAGS)('%s: bật đúng hai giá trị mang nghĩa đúng', (flag) => {
    expect(parseNamed(flag, 'true')).toBe(true);
    expect(parseNamed(flag, '1')).toBe(true);
  });

  it.each(SIX_FLAGS)('%s: "false" và "0" KHÔNG được hiểu là bật', (flag) => {
    expect(parseNamed(flag, 'false')).toBe(false);
    expect(parseNamed(flag, '0')).toBe(false);
  });

  it.each(SIX_FLAGS)('%s: giá trị lạ thì tắt, rỗng và không gửi thì undefined', (flag) => {
    expect(parseNamed(flag, 'no')).toBe(false);
    expect(parseNamed(flag, 'abc')).toBe(false);
    expect(parseNamed(flag, '')).toBeUndefined();
    expect(parseNamed(flag, undefined)).toBeUndefined();
  });

  it.each(SIX_FLAGS)('%s: không giá trị tắt nào lọt qua phép kiểm `=== true`', (flag) => {
    for (const raw of [undefined, '', 'false', '0', 'no', 'abc']) {
      expect(parseNamed(flag, raw) === true).toBe(false);
    }
  });

  it('held là cờ ba trạng thái — false mang nghĩa riêng, rỗng thì KHÔNG lọc', () => {
    // `getOrders` kiểm `typeof dto.held === 'boolean'`, nên rỗng phải ra
    // undefined chứ không phải false: false sẽ lọc mất đơn đang giữ.
    expect(parseNamed('held', 'false')).toBe(false);
    expect(parseNamed('held', '')).toBeUndefined();
  });
});


/**
 * `ORD-23` phần hai — `hasError` và `unmapped` có BẢN KHAI THỨ HAI ở
 * `GetFactoryOverviewZod` (tab Dashboard "Đơn hàng theo xưởng"). Cùng tên cờ mà
 * hai hành vi là cái bẫy khó ngờ nhất: cùng một tham số, hai endpoint, hai kết
 * quả. Đo trước khi sửa: `unmapped=false` thu hẹp cả tab xuống **0 đơn** —
 * dashboard trắng trơn mà không báo lỗi gì.
 */
describe('ORD-23 — cùng tên cờ thì cùng hành vi ở cả hai endpoint', () => {
  it.each(['hasError', 'unmapped'])('%s: factory-overview phân giải giống hệt danh sách đơn', (flag) => {
    for (const raw of ['true', '1', 'false', '0', 'no', '']) {
      const overview = (GetFactoryOverviewZod.parse({ [flag]: raw }) as Record<string, unknown>)[flag];
      const list = (GetProductionOrdersZod.parse({ page: 1, limit: 20, [flag]: raw }) as Record<string, unknown>)[
        flag
      ];
      expect(overview).toBe(list);
    }
  });

  it.each(['hasError', 'unmapped'])('%s: chỉ true/1 mới thu hẹp tab xưởng', (flag) => {
    const val = (raw?: string) =>
      (GetFactoryOverviewZod.parse(raw === undefined ? {} : { [flag]: raw }) as Record<string, unknown>)[flag];
    expect(val('true')).toBe(true);
    expect(val('1')).toBe(true);
    expect(val('false')).toBe(false);
    expect(val('no')).toBe(false);
    expect(val('')).toBeUndefined();
    expect(val(undefined)).toBeUndefined();
  });
});
