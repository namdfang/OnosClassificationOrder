/**
 * Helper tận dụng cho 4 formatter Telegram.
 *
 * Quy ước hiển thị:
 *   - Số 0 → text thường, không bold (sink into background)
 *   - Số > 0 → `*N*` bold (pop out)
 *   → Mắt quét nhanh thấy ngay số > 0 trên màn hình mobile dày đặc.
 */

export const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

/** Escape ký tự đặc biệt Markdown trong tên/email/factory… */
export function escapeMd(input: string): string {
  return input.replace(/([_*`[\]])/g, '\\$1');
}

/** `N(0)` → `'0'`. `N(5)` → `'*5*'` (bold). */
export function N(n: number): string {
  return n > 0 ? `*${n}*` : `${n}`;
}

/** Cắt message nếu vượt 4096 char + append `... (cắt bớt)`. */
export function clamp(message: string): string {
  if (message.length <= MAX_TELEGRAM_MESSAGE_LENGTH) return message;
  return message.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 20) + '\n... _(cắt bớt)_';
}

/** Phân cách nhẹ giữa item / section. */
export const DIVIDER = '─────────────';
