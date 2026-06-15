import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
dayjs.extend(timezone);

export const getTrackingDate = (trackingDetail: string) => {
  const dateString = trackingDetail.split('-')[1].trim();

  const [monthDay, time] = dateString.split(', ');
  const [month, day] = monthDay.split(' ');
  const [hourMinute, period] = [time.slice(0, -2), time.slice(-2)];
  // eslint-disable-next-line prefer-const
  let [hour, minute] = hourMinute.split(':').map(Number);

  if (period === 'PM' && hour !== 12) {
    hour += 12;
  }

  if (period === 'AM' && hour === 12) {
    hour = 0;
  }

  // Create date with the current year
  // const date = new Date();
  // date.setMonth(new Date(`${month} 1`).getMonth());
  // date.setDate(Number.parseInt(day, 10));
  // date.setHours(hour, minute, 0, 0);

  const currentDate = dayjs().tz('America/New_York');
  const date = currentDate
    .month(new Date(`${month} 1`).getMonth())
    .date(Number.parseInt(day, 10))
    .hour(hour)
    .minute(minute)
    .second(0)
    .millisecond(0);

  return date.toDate();
};
