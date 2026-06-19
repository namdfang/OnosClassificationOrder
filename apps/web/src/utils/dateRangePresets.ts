/**
 * Quick date range presets dùng chung cho tất cả filter ngày trong app.
 *
 * - Trả về `yyyy-mm-dd` (string) — khớp format <input type="date"> và
 *   convention `createdFrom` / `createdTo` của BE.
 * - Local timezone — KHÔNG dùng `toISOString()` (UTC) vì sẽ lệch ngày khi
 *   ở Việt Nam buổi sáng (UTC vẫn còn hôm trước).
 * - "Tuần" bắt đầu thứ Hai (theo convention Việt Nam / ISO).
 */

export interface DatePreset {
  key: string;
  label: string;
  range: () => { from: string; to: string };
}

function toISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // getDay(): 0=CN, 1=T2, ..., 6=T7. Convert sang offset từ T2.
  const dow = out.getDay();
  const offsetToMonday = (dow + 6) % 7;
  out.setDate(out.getDate() - offsetToMonday);
  return out;
}

function endOfWeek(d: Date): Date {
  const out = startOfWeek(d);
  out.setDate(out.getDate() + 6);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export const DATE_PRESETS: DatePreset[] = [
  {
    key: 'today',
    label: 'Hôm nay',
    range: () => {
      const t = toISO(new Date());
      return { from: t, to: t };
    },
  },
  {
    key: 'yesterday',
    label: 'Hôm qua',
    range: () => {
      const y = toISO(addDays(new Date(), -1));
      return { from: y, to: y };
    },
  },
  {
    key: 'this-week',
    label: 'Tuần này',
    range: () => {
      const now = new Date();
      return { from: toISO(startOfWeek(now)), to: toISO(endOfWeek(now)) };
    },
  },
  {
    key: 'last-week',
    label: 'Tuần trước',
    range: () => {
      const lastWeek = addDays(new Date(), -7);
      return { from: toISO(startOfWeek(lastWeek)), to: toISO(endOfWeek(lastWeek)) };
    },
  },
  {
    key: 'this-month',
    label: 'Tháng này',
    range: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: toISO(from), to: toISO(to) };
    },
  },
  {
    key: 'last-month',
    label: 'Tháng trước',
    range: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toISO(from), to: toISO(to) };
    },
  },
  {
    key: 'this-year',
    label: 'Năm nay',
    range: () => {
      const y = new Date().getFullYear();
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    },
  },
  {
    key: 'last-year',
    label: 'Năm trước',
    range: () => {
      const y = new Date().getFullYear() - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    },
  },
];

/**
 * Tìm preset đang khớp với `(from, to)` hiện tại. Null nếu user chọn range
 * tùy chỉnh không khớp preset nào.
 */
export function matchPreset(from: string, to: string): string | null {
  for (const p of DATE_PRESETS) {
    const r = p.range();
    if (r.from === from && r.to === to) return p.key;
  }
  return null;
}
