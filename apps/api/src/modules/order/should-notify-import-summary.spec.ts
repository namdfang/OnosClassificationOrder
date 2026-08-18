import { shouldNotifyImportSummary } from './should-notify-import-summary';

/**
 * Điều kiện gửi tin tổng kết import lên Telegram (`ORD-1`).
 *
 * Rủi ro chính ghi ở change note §7 là đặt điều kiện SAI CHIỀU khiến tin ngừng
 * gửi cả khi có đơn mới — AC-02 là chốt chặn cho việc đó.
 */
describe('shouldNotifyImportSummary — điều kiện gửi tin tổng kết import', () => {
  it('AC-01: không đơn mới, không dòng bỏ qua → KHÔNG gửi, kể cả khi có đơn được cập nhật', () => {
    expect(shouldNotifyImportSummary({ imported: 0, skippedCount: 0 })).toBe(false);
  });

  it('AC-02: có đơn mới → VẪN gửi (chốt chặn chiều ngược lại)', () => {
    expect(shouldNotifyImportSummary({ imported: 1, skippedCount: 0 })).toBe(true);
    expect(shouldNotifyImportSummary({ imported: 120, skippedCount: 0 })).toBe(true);
  });

  it('AC-03: không đơn mới nhưng có dòng bỏ qua → VẪN gửi, để nhóm biết file import hỏng', () => {
    expect(shouldNotifyImportSummary({ imported: 0, skippedCount: 1 })).toBe(true);
  });

  it('vừa có đơn mới vừa có dòng bỏ qua → gửi', () => {
    expect(shouldNotifyImportSummary({ imported: 5, skippedCount: 3 })).toBe(true);
  });
});
