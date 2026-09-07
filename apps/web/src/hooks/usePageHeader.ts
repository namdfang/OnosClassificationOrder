import { useEffect } from 'react';

import { usePageHeaderStore } from '@/store/pageHeaderStore';

/**
 * Đưa tiêu đề + phụ đề của trang lên Header (`components/header`). Gọi ở page
 * component; đổi ngôn ngữ (title đổi) thì tự cập nhật, unmount thì xóa.
 */
export function usePageHeader(title: string, subtitle?: string): void {
  const set = usePageHeaderStore((s) => s.set);
  const clear = usePageHeaderStore((s) => s.clear);
  useEffect(() => {
    set(title, subtitle);
    return () => clear();
  }, [title, subtitle, set, clear]);
}
