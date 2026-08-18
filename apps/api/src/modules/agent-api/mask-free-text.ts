/**
 * Che theo mẫu cho văn bản người dùng gõ tay (`API-1`, BR-4a §5b).
 *
 * ⚠️ **HIỆN KHÔNG CÒN NƠI NÀO GỌI HÀM NÀY.** `API-11` bỏ che cho trường văn bản
 * tự do, `API-12` bỏ nốt cho `before`/`after` của nhật ký đơn — người dùng yêu
 * cầu agent đọc nguyên văn. Chỉ còn unit test tham chiếu tới đây.
 *
 * Giữ lại (thay vì xoá) để khôi phục được ngay nếu có change request siết lại:
 * bộ mẫu bên dưới đã qua kiểm thử kỹ, đặc biệt là ca mã sản xuất
 * `XQ-91783-27005` **không** bị che nhầm thành số điện thoại — viết lại từ đầu
 * dễ vấp đúng chỗ đó. Nhưng **đừng nhìn file này rồi kết luận là hệ thống đang
 * che**: nó đang không che.
 *
 * Luật che theo TÊN TRƯỜNG không chạm tới nội dung tự do: một ghi chú gõ tay
 * có thể chứa email hoặc số điện thoại khách và sẽ đi thẳng ra ngoài trong khi
 * vẫn "đúng" mọi luật che. Hàm này bịt đúng lỗ đó.
 *
 * BA đã cân nhắc và CHẤP NHẬN rủi ro tồn đọng: tên nhân viên viết lẫn trong
 * câu ("Hùng đã sửa lại file") không nhận ra được bằng mẫu. Không quét ngữ
 * nghĩa — xem BR-4a §5b.
 */

export const MASKED_EMAIL = '[email đã ẩn]';
export const MASKED_PHONE = '[số điện thoại đã ẩn]';

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Số điện thoại: tối thiểu 8 chữ số, cho phép `+`, khoảng trắng, `-`, `.`, `()`
 * xen giữa.
 *
 * Hai chốt chặn để KHÔNG nuốt nhầm mã sản xuất dạng `XQ-91783-27005`:
 *  - đằng trước không được là chữ cái hay dấu gạch nối (`(?<![A-Za-z-])`);
 *  - đằng sau không được là chữ cái hay dấu gạch nối (`(?![A-Za-z-])`).
 * Mã đơn luôn có cụm chữ và dấu gạch dính liền nên rơi ra ngoài mẫu này.
 */
const PHONE_PATTERN = /(?<![A-Za-z0-9-])\+?\(?\d(?:[\d\s.()-]{6,18})\d(?![A-Za-z0-9-])/g;

const countDigits = (s: string): number => (s.match(/\d/g) ?? []).length;

/**
 * Che email và số điện thoại trong một chuỗi. Chỉ thay phần khớp, KHÔNG xoá cả
 * câu — người đọc vẫn nắm được ý của ghi chú.
 */
export function maskFreeText(input: string): string {
  if (!input) return input;

  return input.replace(EMAIL_PATTERN, MASKED_EMAIL).replace(PHONE_PATTERN, (match) => {
    // Chuỗi dài toàn dấu chấm/gạch cũng khớp khung trên — chỉ che khi thật sự
    // đủ chữ số của một số điện thoại.
    if (countDigits(match) < 8 || countDigits(match) > 15) return match;
    return MASKED_PHONE;
  });
}

/**
 * Áp `maskFreeText` cho mọi chuỗi bên trong một giá trị bất kỳ (chuỗi, mảng
 * chuỗi, hoặc mảng lồng). Dùng cho các trường như `toolCheckErrorNotes` vốn là
 * mảng chuỗi, và cho giá trị cũ/mới của nhật ký.
 */
export function maskFreeTextDeep(value: unknown): unknown {
  if (typeof value === 'string') return maskFreeText(value);
  if (Array.isArray(value)) return value.map((v) => maskFreeTextDeep(v));
  return value;
}
