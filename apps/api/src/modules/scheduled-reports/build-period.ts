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
 * `REPORT_DAY_COUNT` ngày liền kề theo giờ VN, cũ → mới (phần tử cuối = hôm
 * nay) — mỗi window `[00:00, 00:00 ngày sau)`.
 */
export function buildReportDayWindows(now: Date): ReportDayWindow[] {
  return Array.from({ length: REPORT_DAY_COUNT }, (_, i) => {
    const offset = i - (REPORT_DAY_COUNT - 1); // ...-2, -1, 0
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
