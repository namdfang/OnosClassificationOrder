import { create } from 'zustand';

/**
 * Tiêu đề trang hiển thị TRÊN HEADER (thay khối tiêu đề to trong thân trang — tiết
 * kiệm chiều cao cho bảng). Trang khai qua `usePageHeader()`; rời trang thì tự xóa.
 * Không persist — chỉ sống trong phiên render.
 */
interface PageHeaderStore {
  title: string;
  subtitle: string;
  set: (title: string, subtitle?: string) => void;
  clear: () => void;
}

export const usePageHeaderStore = create<PageHeaderStore>((set) => ({
  title: '',
  subtitle: '',
  set: (title, subtitle = '') => set({ title, subtitle }),
  clear: () => set({ title: '', subtitle: '' }),
}));
