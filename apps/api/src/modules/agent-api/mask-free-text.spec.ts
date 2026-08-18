import { MASKED_EMAIL, MASKED_PHONE, maskFreeText, maskFreeTextDeep } from './mask-free-text';

/**
 * Che theo mẫu cho văn bản gõ tay (`API-1`, BR-4a §5b).
 *
 * Đây là chỗ dễ sai nhất của toàn bộ lớp che: mẫu số điện thoại quá tham thì
 * nuốt mất mã sản xuất, quá lỏng thì lọt số có dấu cách. Ca quan trọng nhất là
 * `XQ-91783-27005` — mã đơn thật của hệ thống, KHÔNG được che nhầm.
 */
describe('maskFreeText — che email và số điện thoại trong ghi chú gõ tay', () => {
  it('che email đứng một mình', () => {
    expect(maskFreeText('khach@example.com')).toBe(MASKED_EMAIL);
  });

  it('che email nằm giữa câu, giữ nguyên phần còn lại', () => {
    expect(maskFreeText('Khách báo qua mail khach.vip+1@example.co.uk nhé')).toBe(
      `Khách báo qua mail ${MASKED_EMAIL} nhé`,
    );
  });

  it('che số điện thoại nhiều định dạng', () => {
    expect(maskFreeText('0912345678')).toBe(MASKED_PHONE);
    expect(maskFreeText('+84 912 345 678')).toBe(MASKED_PHONE);
    expect(maskFreeText('Gọi (028) 3822-1234 giờ hành chính')).toBe(`Gọi ${MASKED_PHONE} giờ hành chính`);
  });

  it('KHÔNG che mã sản xuất — chốt chặn chính, mã đơn có thật trong hệ thống', () => {
    expect(maskFreeText('XQ-91783-27005')).toBe('XQ-91783-27005');
    expect(maskFreeText('Đơn XQ-91783-27005 in lại lần 2')).toBe('Đơn XQ-91783-27005 in lại lần 2');
  });

  it('KHÔNG che số ngắn hoặc số lượng thường gặp trong ghi chú', () => {
    expect(maskFreeText('in 250 cái')).toBe('in 250 cái');
    expect(maskFreeText('lệch 1.5 cm')).toBe('lệch 1.5 cm');
  });

  it('KHÔNG che chuỗi số quá dài để là số điện thoại', () => {
    expect(maskFreeText('1234567890123456789')).toBe('1234567890123456789');
  });

  it('giữ nguyên từng ký tự khi không có gì nhạy cảm', () => {
    const s = 'Căn giữa theo đường may, vùng in bị che khi kéo khoá.';
    expect(maskFreeText(s)).toBe(s);
  });

  it('chuỗi rỗng đi qua không lỗi', () => {
    expect(maskFreeText('')).toBe('');
  });

  it('maskFreeTextDeep xử lý mảng chuỗi (toolCheckErrorNotes) và bỏ qua kiểu khác', () => {
    expect(maskFreeTextDeep(['a@b.com', 'ổn'])).toEqual([MASKED_EMAIL, 'ổn']);
    expect(maskFreeTextDeep(42)).toBe(42);
    expect(maskFreeTextDeep(null)).toBeNull();
  });
});
