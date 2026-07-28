/**
 * Ảnh crawl từ onospod lưu dạng thumbnail WordPress có hậu tố kích thước
 * (`...-100x100.jpeg`) — hiển thị thumbnail thì dùng nguyên URL (nhẹ), còn
 * preview/mở tab thì bỏ hậu tố `-{w}x{h}` là ra ảnh gốc full-size.
 * URL không có hậu tố (ảnh upload tay, ảnh nguồn khác) trả về nguyên vẹn.
 */
export const toFullSizeImageUrl = (url?: string): string | undefined =>
  url?.replace(/-\d+x\d+(\.(?:jpe?g|png|webp|gif))$/i, '$1');
