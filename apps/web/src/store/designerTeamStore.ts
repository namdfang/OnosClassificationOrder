import type { DesignerTeamMember } from 'shared';
import { create } from 'zustand';

import { RepositoryRemote } from '@/services';

/**
 * Lightweight store cache designer team list — load 1 lần khi mount cell
 * "Người thực hiện" / dialog assign. Refetch khi onCreate/onUpdate được gọi.
 *
 * Member = sub-designer (role=Designer), key = user._id.
 */
type DesignerTeamStore = {
  members: DesignerTeamMember[];
  loading: boolean;
  loaded: boolean;
  /** Map userId → DesignerTeamMember để resolve fullName nhanh. */
  byId: Record<string, DesignerTeamMember>;
  fetch: () => Promise<void>;
  invalidate: () => void;
};

export const useDesignerTeamStore = create<DesignerTeamStore>((set, get) => ({
  members: [],
  loading: false,
  loaded: false,
  byId: {},
  fetch: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await RepositoryRemote.designer.listTeam();
      const data = (res.data?.data || []) as DesignerTeamMember[];
      const byId: Record<string, DesignerTeamMember> = {};
      for (const m of data) byId[m._id] = m;
      set({ members: data, byId, loaded: true });
    } catch {
      // Silent — caller xử lý lỗi ở handleAxiosError nếu cần.
    } finally {
      set({ loading: false });
    }
  },
  invalidate: () => set({ loaded: false }),
}));
