import { pickProjected } from './pick-projected';

/**
 * `QA-1` — agent không đọc được `variations.*` dù registry khai read=true.
 * Nguyên nhân: bước lọc sau `$project` đọc thẳng `row['variations.sku']`, mà
 * mongo trả về hình mảng `{ variations: [{ sku }] }`. Các case dưới đây khoá
 * hành vi đó lại.
 */
describe('pickProjected', () => {
  it('giữ trường phẳng, bỏ khoá không xin (before/after của orderLogs)', () => {
    const row = { _id: 'x', field: 'status', before: 'a', after: 'b' };
    expect(pickProjected(row, { _id: 1, field: 1 })).toEqual({ _id: 'x', field: 'status' });
  });

  it('QA-1: giữ trường con của mảng subdoc, đúng hình mảng', () => {
    const row = {
      fullName: 'Hoodie',
      variations: [
        { sku: 'H-M', retailPrice: 11.1, attributes: 'Size: M' },
        { sku: 'H-L', retailPrice: 12.2, attributes: 'Size: L' },
      ],
    };
    expect(pickProjected(row, { fullName: 1, 'variations.sku': 1, 'variations.retailPrice': 1 })).toEqual({
      fullName: 'Hoodie',
      variations: [
        { sku: 'H-M', retailPrice: 11.1 },
        { sku: 'H-L', retailPrice: 12.2 },
      ],
    });
  });

  it('KHÔNG trả nguyên khối: trường con ngoài danh sách trắng bị bỏ', () => {
    const row = { variations: [{ sku: 'H-M', cost: 3.5 }] };
    expect(pickProjected(row, { 'variations.sku': 1 })).toEqual({ variations: [{ sku: 'H-M' }] });
  });

  it('giữ nguyên độ dài mảng — số biến thể là thông tin thật', () => {
    const row = { variations: [{ sku: 'A' }, { retailPrice: 9 }] };
    expect(pickProjected(row, { 'variations.sku': 1 })).toEqual({ variations: [{ sku: 'A' }, {}] });
  });

  it('object lồng (không phải mảng) cũng đi vào đúng nhánh', () => {
    const row = { meta: { a: 1, b: 2 } };
    expect(pickProjected(row, { 'meta.a': 1 })).toEqual({ meta: { a: 1 } });
  });

  it('trường lồng vắng mặt thì không dựng ra khoá rỗng', () => {
    expect(pickProjected({ fullName: 'x' }, { fullName: 1, 'variations.sku': 1 })).toEqual({ fullName: 'x' });
  });

  it('mảng rỗng vẫn là mảng rỗng, không biến thành undefined', () => {
    expect(pickProjected({ variations: [] }, { 'variations.sku': 1 })).toEqual({ variations: [] });
  });
});
