import type { ReportDayWindow } from './types';

const TZ_OFFSET_MINUTES = 7 * 60;

/** 00:00 (giờ VN) của ngày chứa `now`, cộng thêm `dayOffset` ngày — trả mốc UTC. */
function vnStartOfDay(now: Date, dayOffset = 0): Date {
  const vn = new Date(now.getTime() + TZ_OFFSET_MINUTES * 60_000);
  vn.setUTCHours(0, 0, 0, 0);
  vn.setUTCDate(vn.getUTCDate() + dayOffset);

  return new Date(vn.getTime() - TZ_OFFSET_MINUTES * 60_000);
}

function fmtDdMm(windowStart: Date): string {
  const vn = new Date(windowStart.getTime() + TZ_OFFSET_MINUTES * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');

  return `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}`;
}

/** Số ngày liền kề trong báo cáo — đổi 1 chỗ này là toàn bộ pipeline + formatter tự theo. */
export const REPORT_DAY_COUNT = 4;

/**
 * Cửa sổ section "SLA sản xuất" — nhìn lùi 7 ngày liền kề (TÍNH CẢ Chủ nhật —
 * khách lên đơn cả CN, đã cân nhắc phương án bỏ CN rồi user chốt tính đủ) để
 * soi đủ các lô đã đến hạn N2.
 */
export const SLA_DAY_COUNT = 7;

/**
 * Chỉ tiêu % CỘNG DỒN stock out theo mốc N (ngày lịch VN kể từ ngày vào SX) —
 * lô đã qua trọn mốc mà dưới ngưỡng → ⚠; riêng N2 là cam kết chu kỳ, quá hạn
 * mà chưa 100% → 🔴 kèm breakdown kẹt ở chặng nào. Đổi chỉ tiêu: sửa TẠI ĐÂY.
 */
export const SLA_TARGETS: { n: number; pct: number }[] = [
  { n: 0, pct: 30 },
  { n: 1, pct: 80 },
  { n: 2, pct: 100 },
];

/**
 * `count` ngày liền kề theo giờ VN, cũ → mới (phần tử cuối = hôm nay) — mỗi
 * window `[00:00, 00:00 ngày sau)`. Mặc định `REPORT_DAY_COUNT` (phễu chính),
 * section SLA truyền `SLA_DAY_COUNT`.
 */
export function buildReportDayWindows(now: Date, count = REPORT_DAY_COUNT): ReportDayWindow[] {
  return Array.from({ length: count }, (_, i) => {
    const offset = i - (count - 1); // ...-2, -1, 0
    const start = vnStartOfDay(now, offset);

    return { label: fmtDdMm(start), from: start, to: vnStartOfDay(now, offset + 1) };
  });
}

export function formatVnDateTime(date: Date): string {
  const vn = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} ` +
    `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`
  );
}
