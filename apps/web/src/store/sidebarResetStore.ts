import { create } from 'zustand';

interface SidebarResetStore {
  path: string | null;
  nonce: number;
  requestReset: (path: string) => void;
}

/**
 * Click lại menu sidebar ĐANG ACTIVE (cùng path đang đứng) → yêu cầu trang đó
 * tự xóa filter về mặc định. Cần store riêng vì React Router KHÔNG điều
 * hướng/remount khi click `Link` trỏ tới URL hiện tại (no-op) — trang phải tự
 * lắng nghe tín hiệu này qua `useSidebarResetSignal`.
 */
export const useSidebarResetStore = create<SidebarResetStore>((set) => ({
  path: null,
  nonce: 0,
  requestReset: (path) => set((s) => ({ path, nonce: s.nonce + 1 })),
}));
