import {
  GetCollectionsZod,
  GetFactoriesZod,
  GetMachineTypesZod,
  GetOrderStatusOverviewZod,
  GetProductCategoriesZod,
  GetWorkshopConfigsZod,
} from 'shared';
import type { ZodTypeAny } from 'zod';

/**
 * `ORD-28` — quét nốt các cờ boolean trên query string sau ORD-21/23/24.
 *
 * Sáu cờ dưới đây đều là **ba trạng thái** ở phía service (`typeof x ===
 * 'boolean'`), nên `false` mang nghĩa riêng chứ không phải "tắt lọc". Với
 * `z.coerce.boolean()` thì chuỗi `'false'` ra `true` — người gọi xin nhóm này
 * lại nhận nhóm kia, và không có lỗi nào báo.
 *
 * `readyForFulfill` là cờ DUY NHẤT trong đợt đang sai thật: `useStatusFilter`
 * gửi `String(value)`, tức `'false'`. Đo trên dữ liệu thật sau khi sửa: `false`
 * trả 4.145 đơn thay vì 35.411, và hai tập cộng lại đúng bằng 39.556.
 */
const FLAGS: Array<[string, ZodTypeAny, string]> = [
  ['GetCollectionsZod', GetCollectionsZod, 'isActive'],
  ['GetFactoriesZod', GetFactoriesZod, 'isActive'],
  ['GetMachineTypesZod', GetMachineTypesZod, 'isActive'],
  ['GetProductCategoriesZod', GetProductCategoriesZod, 'isActive'],
  ['GetWorkshopConfigsZod', GetWorkshopConfigsZod, 'isActive'],
  ['GetOrderStatusOverviewZod', GetOrderStatusOverviewZod, 'readyForFulfill'],
];

const parse = (schema: ZodTypeAny, flag: string, raw?: string): boolean | undefined =>
  (schema.parse(raw === undefined ? {} : { [flag]: raw }) as Record<string, unknown>)[flag] as boolean | undefined;

describe.each(FLAGS)('ORD-28 — %s.%s', (_name, schema, flag) => {
  it('bật với đúng hai giá trị mang nghĩa đúng', () => {
    expect(parse(schema, flag, 'true')).toBe(true);
    expect(parse(schema, flag, '1')).toBe(true);
  });

  it("'false' và '0' phải ra false — đây là ca cũ trả về đúng nhóm ngược lại", () => {
    expect(parse(schema, flag, 'false')).toBe(false);
    expect(parse(schema, flag, '0')).toBe(false);
  });

  it('giá trị lạ thì tắt, không ném lỗi', () => {
    expect(parse(schema, flag, 'xyz')).toBe(false);
    expect(() => parse(schema, flag, 'không-phải-boolean')).not.toThrow();
  });

  it('không gửi hoặc gửi rỗng thì KHÔNG lọc — service kiểm typeof === boolean', () => {
    expect(parse(schema, flag, undefined)).toBeUndefined();
    expect(parse(schema, flag, '')).toBeUndefined();
  });

  it('false KHÁC undefined — trộn hai cái là mất hẳn một nhánh lọc', () => {
    expect(typeof parse(schema, flag, 'false')).toBe('boolean');
    expect(typeof parse(schema, flag, undefined)).not.toBe('boolean');
  });
});
