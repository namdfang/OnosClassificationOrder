import { useEffect, useMemo, useState } from 'react';

/**
 * Chuỗi dự phòng nhiều bậc cho 1 thẻ `<img>`: thử lần lượt từng URL theo thứ tự
 * ưu tiên, mỗi lần `onError` thì tụt xuống bậc sau; hết bậc thì trả `src`
 * `undefined` để nơi gọi vẽ **ảnh mặc định của riêng nó**.
 *
 * Sinh ra cho catalog khách (`Catalog.md` §5.1): API trả `mockupLarge` (ảnh gốc
 * full-size) bên cạnh `mockup` (thumbnail `-100x100`). Ảnh gốc có thể đã bị xóa
 * khỏi onospod trong khi thumbnail vẫn còn, nên **không được** thay thẳng bằng
 * ảnh lớn — phải rơi ngược về thumbnail trước, rồi mới tới ảnh mặc định.
 *
 * Hook chỉ giữ *logic* dự phòng, KHÔNG áp đặt giao diện: trang public và trang
 * khách đã đăng nhập có ảnh mặc định khác nhau và mỗi bên tự vẽ phần của mình.
 *
 * URL rỗng/`undefined` bị loại, URL trùng nhau chỉ tính 1 bậc — trường hợp ảnh
 * upload tay không có hậu tố kích thước thì `mockupLarge === mockup`, tránh thử
 * lại đúng một URL vừa hỏng.
 */
export function useImageFallback(sources: (string | undefined)[]): {
  /** URL đang thử; `undefined` nghĩa là đã hết bậc → vẽ ảnh mặc định. */
  src?: string;
  /** Gắn vào `onError` của `<img>`. */
  onError: () => void;
} {
  const key = sources.filter(Boolean).join('\n');
  const candidates = useMemo(() => (key ? Array.from(new Set(key.split('\n'))) : []), [key]);

  const [failed, setFailed] = useState(0);
  // Đổi sản phẩm (điều hướng giữa 2 trang chi tiết, lưới đổi trang) thì chuỗi
  // phải chạy lại từ bậc 1, không giữ số lần hỏng của sản phẩm trước.
  useEffect(() => setFailed(0), [candidates]);

  return {
    src: candidates[failed],
    onError: () => setFailed((n) => n + 1),
  };
}
