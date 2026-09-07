import type { DateOption } from "@/components/shared/time-filter";

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString("vi-VN");
}

/**
 * Parse a YYYY-MM-DD string into the start-of-day boundary in Vietnam
 * timezone (UTC+7). Server stores `createdAt` as UTC; users picking
 * "2026-05-11" via the date filter mean the whole Vietnamese calendar
 * day. Without TZ awareness `new Date("2026-05-11")` = 2026-05-11T00:00Z
 * = 2026-05-11 07:00 VN, missing 7 hours of the user's intended day.
 *
 * Both inputs accept either a bare date string (YYYY-MM-DD) or a full
 * ISO timestamp; passing an ISO with explicit time keeps that time.
 */
export function vnDayStart(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(dateStr);
  return new Date(`${dateStr}T00:00:00+07:00`);
}
export function vnDayEnd(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(dateStr);
  return new Date(`${dateStr}T23:59:59.999+07:00`);
}

/** Convert DateOption to { dateFrom, dateTo } ISO strings */
export function dateOptionToRange(option: DateOption): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const startOfDay = (d: Date) => { d.setHours(0, 0, 0, 0); return d; };
  const endOfDay = (d: Date) => { d.setHours(23, 59, 59, 999); return d; };

  switch (option) {
    case "Today": {
      return {
        dateFrom: startOfDay(new Date(now)).toISOString(),
        dateTo: endOfDay(new Date(now)).toISOString(),
      };
    }
    case "Yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return {
        dateFrom: startOfDay(new Date(y)).toISOString(),
        dateTo: endOfDay(new Date(y)).toISOString(),
      };
    }
    case "This Week": {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      return {
        dateFrom: startOfDay(start).toISOString(),
        dateTo: endOfDay(new Date(now)).toISOString(),
      };
    }
    case "Last Week": {
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      return {
        dateFrom: startOfDay(lastWeekStart).toISOString(),
        dateTo: endOfDay(lastWeekEnd).toISOString(),
      };
    }
    case "This Month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        dateFrom: startOfDay(start).toISOString(),
        dateTo: endOfDay(new Date(now)).toISOString(),
      };
    }
    case "Last Month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        dateFrom: startOfDay(start).toISOString(),
        dateTo: endOfDay(end).toISOString(),
      };
    }
    case "This Year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return {
        dateFrom: startOfDay(start).toISOString(),
        dateTo: endOfDay(new Date(now)).toISOString(),
      };
    }
    case "All time": {
      // Empty range — consumers use `if (dateRange.dateFrom)` guards, so empty
      // strings skip the date filter and show everything across history.
      return { dateFrom: "", dateTo: "" };
    }
  }
}
