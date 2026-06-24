import type { ReportPeriod, ReportSlot } from './types';

const TZ_OFFSET_MINUTES = 7 * 60;

const SLOT_LABEL: Record<ReportSlot, string> = {
  morning: 'Ca đêm/sáng sớm',
  noon: 'Ca sáng',
  evening: 'Ca chiều',
};

function vnTimeFor(now: Date, hh: number, mm: number, dayOffset = 0): Date {
  const utcMs = now.getTime();
  const vnMs = utcMs + TZ_OFFSET_MINUTES * 60_000;
  const vn = new Date(vnMs);
  vn.setUTCHours(hh, mm, 0, 0);
  vn.setUTCDate(vn.getUTCDate() + dayOffset);

  return new Date(vn.getTime() - TZ_OFFSET_MINUTES * 60_000);
}

export function buildShiftPeriod(now: Date, slot: ReportSlot): ReportPeriod {
  let from: Date;
  let to: Date;

  if (slot === 'morning') {
    from = vnTimeFor(now, 18, 30, -1);
    to = vnTimeFor(now, 7, 30);
  } else if (slot === 'noon') {
    from = vnTimeFor(now, 7, 30);
    to = vnTimeFor(now, 13, 0);
  } else {
    from = vnTimeFor(now, 13, 0);
    to = vnTimeFor(now, 18, 30);
  }

  return { from, to, slot, slotLabel: SLOT_LABEL[slot] };
}

export function formatVnDateTime(date: Date): string {
  const vn = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} ` +
    `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`
  );
}

export function formatVnHourMinute(date: Date): string {
  const vn = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');

  return `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`;
}
