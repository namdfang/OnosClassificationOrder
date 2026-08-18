import { parseTypeFilter } from './parse-type-filter';

/**
 * Lọc theo loại sản phẩm ở trang Orders Classic (`ORD-1`).
 *
 * Case quan trọng nhất là `"Tee, Long Sleeve"`: `type` là tên sản phẩm tự do nhập
 * từ file import nên dấu phẩy là ký tự **dữ liệu** hợp lệ, không phải ký tự phân
 * tách. Tách nó ra sẽ lọc sai mà KHÔNG báo lỗi — xem `.devtasks/design/ORD-1.md` §9 D1.
 */
describe('parseTypeFilter — lọc theo tên loại sản phẩm', () => {
  it('tham số lặp → mỗi phần tử là một tên', () => {
    expect(parseTypeFilter(['Hoodie', 'Tee'])).toEqual({ names: ['Hoodie', 'Tee'], hasNone: false });
  });

  it('chuỗi đơn → ĐÚNG một tên', () => {
    expect(parseTypeFilter('Hoodie')).toEqual({ names: ['Hoodie'], hasNone: false });
  });

  it('KHÔNG tách tên chứa dấu phẩy — đây là chốt chặn chính của AC-04', () => {
    expect(parseTypeFilter('Tee, Long Sleeve')).toEqual({ names: ['Tee, Long Sleeve'], hasNone: false });
    expect(parseTypeFilter(['Tee, Long Sleeve', 'Hoodie'])).toEqual({
      names: ['Tee, Long Sleeve', 'Hoodie'],
      hasNone: false,
    });
  });

  it('giữ nguyên tên chứa ký tự nhạy cảm với query string (2 tên có thật trong DB)', () => {
    expect(parseTypeFilter('All-Over Print Pique & Mesh Football Jersey').names).toEqual([
      'All-Over Print Pique & Mesh Football Jersey',
    ]);
    expect(parseTypeFilter("BELLA + CANVAS - Women's Micro Rib Baby Tee - 1010").names).toEqual([
      "BELLA + CANVAS - Women's Micro Rib Baby Tee - 1010",
    ]);
  });

  it('token __none__ đứng một mình → chỉ lọc đơn chưa xác định loại sản phẩm', () => {
    expect(parseTypeFilter('__none__')).toEqual({ names: [], hasNone: true });
  });

  it('token __none__ đi kèm tên thật → tách riêng, không lẫn vào danh sách tên', () => {
    expect(parseTypeFilter(['Hoodie', '__none__'])).toEqual({ names: ['Hoodie'], hasNone: true });
  });

  it('bỏ giá trị rỗng, không sinh ra tên rỗng khớp nhầm mọi đơn', () => {
    expect(parseTypeFilter(['', 'Hoodie', ''])).toEqual({ names: ['Hoodie'], hasNone: false });
    expect(parseTypeFilter('')).toEqual({ names: [], hasNone: false });
  });

  it('KHÔNG trim — tên trong facet sinh từ chính giá trị trong DB nên phải khớp nguyên văn', () => {
    // Nếu trim ở đây mà DB có tên thừa khoảng trắng thì giá trị facet gửi lên sẽ
    // không còn khớp bản ghi nào. Round-trip phải nguyên vẹn.
    expect(parseTypeFilter(' Hoodie ').names).toEqual([' Hoodie ']);
  });
});
