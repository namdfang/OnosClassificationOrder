/**
 * Vietnam timezone (UTC+7) helpers for server-side code.
 * `new Date()` on the server returns UTC — between 0:00-7:00 AM Vietnam time,
 * UTC is still the previous day/month, causing wrong month strings.
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Get current Date adjusted to Vietnam timezone */
export function vnNow(): Date {
  return new Date(Date.now() + VN_OFFSET_MS);
}

/** Get current month string in "YYYY-MM" format (Vietnam timezone) */
export function vnMonth(): string {
  const vn = vnNow();
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Tháng liền TRƯỚC của một chuỗi "YYYY-MM". Thuần chuỗi/số — KHÔNG đi qua `new Date`, vì
 * `new Date("2026-01")` diễn giải theo UTC rồi lệch múi giờ đúng vào ca đầu năm.
 * Chuỗi không đúng dạng thì trả lại nguyên vẹn (chỗ gọi đã có kiểm tra định dạng riêng).
 */
export function prevMonth(month: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return month;
  const y = Number(m[1]), mm = Number(m[2]);
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`;
}

/** Get current date string in "YYYY-MM-DD" format (Vietnam timezone) */
export function vnDateStr(): string {
  const vn = vnNow();
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}-${String(vn.getUTCDate()).padStart(2, "0")}`;
}
