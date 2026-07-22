import { useEffect } from 'react';

import { useSidebarResetStore } from '@/store/sidebarResetStore';

/**
 * Gọi `onReset` mỗi khi user click lại đúng menu sidebar đang active của
 * trang này (`path` phải khớp CHÍNH XÁC giá trị `to` khai báo ở `NAV_GROUPS`
 * trong `Sidebar.tsx`, kể cả query string nếu có — vd `${PATHS.HOME}?tab=...`).
 */
export function useSidebarResetSignal(path: string, onReset: () => void): void {
  const resetPath = useSidebarResetStore((s) => s.path);
  const nonce = useSidebarResetStore((s) => s.nonce);

  useEffect(() => {
    if (resetPath === path && nonce > 0) onReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, resetPath]);
}
