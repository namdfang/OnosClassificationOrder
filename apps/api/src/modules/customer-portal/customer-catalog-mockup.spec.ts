import { toFullSizeImageUrl } from 'shared';

/**
 * Hợp đồng ảnh catalog khách (`CAT-1`): `CustomerCatalogService.mapRow()` trả
 * thêm `mockupLarge = toFullSizeImageUrl(mockup)` bên cạnh `mockup` gốc.
 *
 * Các case dưới đây là chính những trường hợp biên quyết định AC-01 (ảnh đủ nét)
 * và AC-02 (không bao giờ để ô ảnh vỡ) — xem `.devtasks/srs/CAT-1.md`.
 */
describe('toFullSizeImageUrl — dựng URL mockup full-size cho catalog khách', () => {
  it('bỏ hậu tố thumbnail WordPress mà onospod trả về', () => {
    expect(toFullSizeImageUrl('https://onospod.com/wp-content/uploads/2024/05/tee-100x100.jpeg')).toBe(
      'https://onospod.com/wp-content/uploads/2024/05/tee.jpeg',
    );
  });

  it('bỏ được mọi cỡ thumbnail, không chỉ 100x100', () => {
    expect(toFullSizeImageUrl('https://onospod.com/a/hoodie-300x300.png')).toBe('https://onospod.com/a/hoodie.png');
    expect(toFullSizeImageUrl('https://onospod.com/a/mug-1024x768.webp')).toBe('https://onospod.com/a/mug.webp');
  });

  it('giữ nguyên URL không có hậu tố — ảnh upload tay lưu local-disk', () => {
    const uploaded = '/uploads/mockup/abc123.png';
    expect(toFullSizeImageUrl(uploaded)).toBe(uploaded);
  });

  it('KHÔNG cắt nhầm số nằm trong tên file', () => {
    // "2024" không theo dạng {w}x{h} nên phải giữ nguyên.
    expect(toFullSizeImageUrl('https://onospod.com/a/shirt-2024.jpeg')).toBe('https://onospod.com/a/shirt-2024.jpeg');
    // Dạng {w}x{h} nhưng KHÔNG ở ngay trước phần mở rộng thì cũng không phải hậu tố thumbnail.
    expect(toFullSizeImageUrl('https://onospod.com/a/tee-100x100-final.jpeg')).toBe(
      'https://onospod.com/a/tee-100x100-final.jpeg',
    );
  });

  it('sản phẩm KHÔNG có mockup thì mockupLarge cũng để trống — FE rơi thẳng về ảnh mặc định (AC-02)', () => {
    expect(toFullSizeImageUrl(undefined)).toBeUndefined();
  });

  it('KHÔNG đụng tới giá trị mockup gốc — nó là bậc dự phòng khi ảnh full-size 404 (AC-02)', () => {
    const mockup = 'https://onospod.com/a/tee-100x100.jpeg';
    const mockupLarge = toFullSizeImageUrl(mockup);
    expect(mockupLarge).not.toBe(mockup);
    expect(mockup).toBe('https://onospod.com/a/tee-100x100.jpeg');
  });
});
