import type { SidebarCounts } from 'shared';
import { create } from 'zustand';

interface SidebarBadgeStore {
  counts: SidebarCounts | null;
  /** Timestamp lần cuối có mutation liên quan — Sidebar debounce rồi refetch. */
  refreshRequestedAt: number;
  setCounts: (counts: SidebarCounts | null) => void;
  requestRefresh: () => void;
}

/**
 * Số đếm badge sidebar (Nhật ký bù lỗi / Designer / Soát tool). Store TÁCH
 * KHỎI services để axios interceptor (`apis/index.tsx`) gọi `requestRefresh()`
 * sau mỗi mutation thành công mà không tạo vòng import (apis ↔ services).
 * Fetch/polling nằm ở `Sidebar.tsx`.
 */
export const useSidebarBadgeStore = create<SidebarBadgeStore>((set) => ({
  counts: null,
  refreshRequestedAt: 0,
  setCounts: (counts) => set({ counts }),
  requestRefresh: () => set({ refreshRequestedAt: Date.now() }),
}));
