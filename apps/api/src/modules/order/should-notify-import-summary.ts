/**
 * Quyết định có gửi tin tổng kết import lên Telegram hay không (`ORD-1`).
 *
 * Quy tắc chốt trong change note `.devtasks/srs/ORD-1.md` §3: chỉ IM LẶNG khi lần
 * import **không tạo đơn mới nào VÀ không có dòng nào bị bỏ qua**. Số đơn được
 * cập nhật (`updated`) KHÔNG tham gia quyết định — import chạm lại đơn cũ là
 * chuyện thường ngày, tin đó chỉ làm nhiễu kênh.
 *
 * Dòng bị bỏ qua vẫn phải báo: đó là dấu hiệu file import hỏng, im lặng sẽ che
 * mất sự cố thật.
 */
export function shouldNotifyImportSummary(args: { imported: number; skippedCount: number }): boolean {
  return args.imported > 0 || args.skippedCount > 0;
}
