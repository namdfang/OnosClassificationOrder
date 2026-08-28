import { resolveBarcodeSkuBase } from './barcode-label';

/**
 * SKU trên tem barcode xưởng — sai là công nhân đối chiếu nhầm kệ hàng, nên
 * chốt cứng hành vi từng nhánh: cắt đuôi size, tiền tố chung, các fallback.
 */
describe('resolveBarcodeSkuBase', () => {
  it('cắt đuôi size khỏi variation khớp (ca chuẩn theo ảnh mẫu PM-11594-04672)', () => {
    expect(
      resolveBarcodeSkuBase(['AOP-CUS-SHAPE-TIE-10.6X62.2', 'AOP-CUS-SHAPE-TIE-11.8X65'], '10.6x62.2'),
    ).toBe('AOP-CUS-SHAPE-TIE');
  });

  it('so khớp size lỏng tay — khác hoa thường và dấu nối vẫn khớp', () => {
    expect(resolveBarcodeSkuBase(['KID-3DSHIRT-YM'], 'ym')).toBe('KID-3DSHIRT');
    expect(resolveBarcodeSkuBase(['CHW-SHIRT-SET-S'], 'S')).toBe('CHW-SHIRT-SET');
  });

  it('size lẫn dấu nối (2-XL vs 2XL) vẫn cắt đúng mép', () => {
    expect(resolveBarcodeSkuBase(['MUG-CLASSIC-2-XL'], '2XL')).toBe('MUG-CLASSIC');
  });

  it('không khớp size → tiền tố chung dài nhất của các variation', () => {
    expect(resolveBarcodeSkuBase(['HOODIE-AOP-S', 'HOODIE-AOP-M'], 'khong-ton-tai')).toBe('HOODIE-AOP');
  });

  it('tiền tố chung quá ngắn → trả variation đầu tiên thay vì mã cụt vô nghĩa', () => {
    expect(resolveBarcodeSkuBase(['ABC-1', 'XYZ-2'])).toBe('ABC-1');
  });

  it('1 variation duy nhất không khớp size → trả nguyên SKU', () => {
    expect(resolveBarcodeSkuBase(['SOLO-SKU'], 'M')).toBe('SOLO-SKU');
  });

  it('không có variation nào → undefined (tem bỏ trống mã)', () => {
    expect(resolveBarcodeSkuBase([])).toBeUndefined();
    expect(resolveBarcodeSkuBase(['  ', ''])).toBeUndefined();
  });

  it('size chiếm TRỌN sku (sku == size) → không trả chuỗi rỗng mà rơi về fallback', () => {
    expect(resolveBarcodeSkuBase(['10.6X62.2'], '10.6x62.2')).toBe('10.6X62.2');
  });
});
