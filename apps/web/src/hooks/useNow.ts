import { useEffect, useState } from 'react';

/** Re-render mỗi `intervalMs` — dùng cho chip đếm ngược (hạn dự kiến) cần tick theo thời gian thực. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
