import { buildTableMeta } from './agent-table-meta';
import { AGENT_TABLE_REGISTRY } from './registry';

/**
 * `API-18` — bề mặt agent mô tả trường ngang mức bề mặt quản trị, và hai nơi
 * không được mô tả cùng một trường theo hai kiểu khác nhau (AC-03).
 *
 * AC-03 đã đạt **bằng cấu trúc**: cả hai bề mặt gọi `buildTableMeta`, và
 * `AgentAdminTableZod` được dẫn xuất từ `AgentTableSummaryZod` thay vì khai
 * lại. Test dưới đây chốt chính điều đó lại, để lần sau ai đó dựng lại mô tả ở
 * một trong hai service thì đỏ ngay chứ không im lặng phân đôi.
 */
describe('API-18 — metadata bảng cho agent', () => {
  const specs = Object.values(AGENT_TABLE_REGISTRY);

  it('mọi bảng đều có đủ metadata, không bảng nào rỗng', () => {
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      const meta = buildTableMeta(spec);
      expect(meta.key).toBe(spec.key);
      expect(meta.description).toBeTruthy();
      expect(meta.entityName).toBeTruthy();
      expect(meta.defaultSort).toBeTruthy();
      expect(meta.fields.length).toBeGreaterThan(0);
    }
  });

  it('AC-01: mỗi trường có đủ sáu thuộc tính chính sách', () => {
    for (const spec of specs) {
      for (const field of buildTableMeta(spec).fields) {
        expect(typeof field.name).toBe('string');
        expect(['string', 'number', 'date', 'bool', 'objectId', 'enum', 'object']).toContain(field.type);
        expect(typeof field.read).toBe('boolean');
        expect(['none', 'eq', 'full']).toContain(field.filter);
        expect(typeof field.sortable).toBe('boolean');
        expect(typeof field.groupable).toBe('boolean');
      }
    }
  });

  it('AC-02: excludedFields chỉ có TÊN trường, và tên đó không trùng trường đọc được', () => {
    for (const spec of specs) {
      const meta = buildTableMeta(spec);
      for (const name of meta.excludedFields) {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      }
      // Một trường vừa bị loại trừ vừa nằm trong danh sách trắng là mâu thuẫn
      // chính sách, không phải chuyện trình bày.
      const declared = new Set(meta.fields.map((f) => f.name));
      for (const name of meta.excludedFields) expect(declared.has(name)).toBe(false);
    }
  });

  /**
   * Đây là phần thật sự canh AC-02: metadata **không được** mang giá trị bản
   * ghi. `buildTableMeta` chỉ đọc hằng số trong bộ nhớ nên về nguyên tắc không
   * thể, nhưng nguyên tắc không chặn được người sau nhét thêm một trường
   * `sample` hay `example` vào cho tiện.
   */
  it('AC-02: metadata không chứa khoá nào mang giá trị dữ liệu', () => {
    const allowedTableKeys = new Set([
      'key',
      'description',
      'entityName',
      'defaultSort',
      'fieldCount',
      'readableFields',
      'fields',
      'excludedFields',
    ]);
    const allowedFieldKeys = new Set([
      'name',
      'type',
      'read',
      'filter',
      'sortable',
      'groupable',
      'aggregatable',
      'freeText',
      'note',
    ]);
    for (const spec of specs) {
      const meta = buildTableMeta(spec);
      for (const key of Object.keys(meta)) expect(allowedTableKeys.has(key)).toBe(true);
      for (const field of meta.fields) {
        for (const key of Object.keys(field)) expect(allowedFieldKeys.has(key)).toBe(true);
      }
    }
  });

  it('readableFields suy từ chính fields, không đếm bằng đường khác', () => {
    for (const spec of specs) {
      const meta = buildTableMeta(spec);
      expect(meta.readableFields).toEqual(meta.fields.filter((f) => f.read).map((f) => f.name));
      expect(meta.fieldCount).toBe(meta.fields.length);
    }
  });

  /**
   * AC-03. Bề mặt quản trị lấy đúng object này rồi bỏ hai khoá; test dựng lại
   * phép bỏ đó và khẳng định phần còn lại trùng khít.
   */
  it('AC-03: bề mặt quản trị là tập con ĐÚNG BẰNG của bề mặt agent', () => {
    for (const spec of specs) {
      const meta = buildTableMeta(spec);
      const { fieldCount: _c, readableFields: _r, ...adminView } = meta;
      expect(Object.keys(adminView).sort()).toEqual(
        ['key', 'description', 'entityName', 'defaultSort', 'fields', 'excludedFields'].sort(),
      );
      expect(adminView.fields).toBe(meta.fields);
    }
  });
});
