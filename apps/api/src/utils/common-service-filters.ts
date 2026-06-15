import type { DatabaseEntityAbstract } from '@core/abstracts';
import type { FilterQuery } from 'mongoose';

export function applyDateFilters<Entity extends DatabaseEntityAbstract>(
  filterQuery: FilterQuery<Entity>,
  from?: Date,
  to?: Date,
  customField?: string,
) {
  if (from) {
    from.setUTCHours(0, 0, 0, 0);

    // Lọc theo 'from'
    if (customField) {
      // @ts-expect-error indexing
      filterQuery[customField] = { ...filterQuery[customField], $gte: from };
    } else {
      filterQuery.createdAt = { ...filterQuery.createdAt, $gte: from };
    }
  }

  if (to) {
    to.setUTCHours(23, 59, 59, 999);

    // Lọc theo 'to'
    if (customField) {
      // @ts-expect-error indexing
      filterQuery[customField] = { ...filterQuery[customField], $lte: to };
    } else {
      filterQuery.createdAt = { ...filterQuery.createdAt, $lte: to };
    }
  }
}

export function calculateDateIntervals(from: Date, to: Date, maxIntervals: number) {
  const startTime = from.getTime();
  const endTime = to.getTime();
  const intervalLength = (endTime - startTime) / maxIntervals;
  const intervals = new Map();

  for (let i = 0; i <= maxIntervals; i++) {
    const intervalStart = new Date(startTime + i * intervalLength);
    const dateKey = intervalStart.toISOString().slice(0, 10);

    if (!intervals.has(dateKey)) {
      const fromTime = new Date(intervalStart);
      const toTime = new Date(intervalStart);

      intervals.set(dateKey, {
        date: dateKey,
        from: fromTime,
        to: toTime,
      });
    }
  }

  return [...intervals.values()];
}

export function calculateDateWeek() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const lastWeekDays = [];

  // If today is not Sunday, get days from Monday to today
  if (dayOfWeek !== 0) {
    for (let i = 1; i <= dayOfWeek; i++) {
      const date = new Date();
      date.setDate(today.getDate() - (dayOfWeek - i));
      date.setUTCHours(0, 0, 0, 0);
      lastWeekDays.push(date);
    }
  }

  return lastWeekDays;
}

export function calculateDateMonth() {
  const today = new Date();
  const month = today.getMonth();
  const year = today.getFullYear();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastMonthDays = [];

  for (let i = firstDayOfMonth.getDate(); i <= today.getDate(); i++) {
    const date = new Date(year, month, i + 1);
    date.setUTCHours(0, 0, 0, 0);
    lastMonthDays.push(date);
  }

  return lastMonthDays;
}

export function getWeekNumber(date: Date): number {
  const oneDay = 1000 * 60 * 60 * 24;
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / oneDay;

  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

export function timeAgo(time: Date) {
  const now = new Date();
  const secondsPast = (now.getTime() - time.getTime()) / 1000;

  if (secondsPast < 60) {
    return `${Math.floor(secondsPast)} seconds ago`;
  }

  const minutesPast = secondsPast / 60;

  if (minutesPast < 60) {
    return `${Math.floor(minutesPast)} minutes ago`;
  }

  const hoursPast = minutesPast / 60;

  if (hoursPast < 24) {
    return `${Math.floor(hoursPast)} hours ago`;
  }

  const daysPast = hoursPast / 24;

  if (daysPast < 30) {
    return `${Math.floor(daysPast)} days ago`;
  }

  const monthsPast = daysPast / 30;

  if (monthsPast < 12) {
    return `${Math.floor(monthsPast)} months ago`;
  }

  const yearsPast = monthsPast / 12;

  return `${Math.floor(yearsPast)} years ago`;
}
