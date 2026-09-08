'use client';

import { useEffect, useState } from 'react';

/** Trả `value` sau khi ngừng đổi `ms` mili giây — dùng cho ô tìm kiếm (khỏi gọi API mỗi phím). */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
