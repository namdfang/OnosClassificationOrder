/**
 * Ảnh mockup crawl từ onospod.com được lưu NGUYÊN dạng thumbnail WordPress có
 * hậu tố kích thước (`...-100x100.jpeg`) — xem khối comment "Crawl ảnh mockup
 * từ onospod.com" ở `apps/api/src/modules/product-config/product-config.service.ts`.
 * Bỏ hậu tố `-{w}x{h}` ngay trước phần mở rộng là ra URL ảnh gốc full-size mà
 * WordPress giữ lại khi upload.
 *
 * URL KHÔNG có hậu tố (ảnh upload tay lưu local-disk, ảnh từ nguồn khác) được
 * trả về nguyên vẹn — hàm này an toàn để gọi trên mọi giá trị `mockup`.
 *
 * Đây là hàm THUẦN dựng URL, KHÔNG kiểm tra ảnh có tồn tại thật hay không:
 * ảnh gốc có thể đã bị xóa khỏi onospod trong khi thumbnail vẫn còn. Nơi hiển
 * thị PHẢI có bậc dự phòng rơi ngược về URL thumbnail gốc rồi mới tới ảnh mặc
 * định (`documents/FunctionDescription/Catalog.md` §6).
 */
export const toFullSizeImageUrl = (url?: string): string | undefined =>
  url?.replace(/-\d+x\d+(\.(?:jpe?g|png|webp|gif))$/i, '$1');
