import type { FactoryOptionItem } from 'shared';
import { create } from 'zustand';

import { RepositoryRemote } from '@/services';

interface FactoryOptionsStore {
  factories: FactoryOptionItem[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
}

/**
 * Danh sách xưởng đang bật (id/name/shortName) — nguồn cho "cụm menu theo
 * xưởng" ở Sidebar và mọi chỗ cần hiện TÊN xưởng đang lọc.
 *
 * Gọi `GET /factories/options` chứ KHÔNG phải `GET /factories`: route sau chỉ
 * mở cho Admin/Manager/Support nên tài khoản Fulfillment/Designer sẽ ăn 403 và
 * mất sạch menu. Fetch 1 lần cho cả phiên (số xưởng vài cái, gần như không đổi).
 */
export const useFactoryOptionsStore = create<FactoryOptionsStore>((set, get) => ({
  factories: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const res = await RepositoryRemote.factory.getFactoryOptions();
      set({ factories: (res.data?.data || []) as FactoryOptionItem[], loaded: true });
    } catch {
      // Lỗi mạng/quyền → không chặn sidebar, chỉ là không có cụm menu xưởng.
      set({ loaded: true });
    } finally {
      set({ loading: false });
    }
  },
}));
