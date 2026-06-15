import { create } from 'zustand';
import type { WorkshopConfig, WorkshopConfigCategory } from 'shared';
import { WORKSHOP_CONFIG_CATEGORIES } from 'shared';

import { RepositoryRemote } from '@/services';

type ByCategory = Record<WorkshopConfigCategory, WorkshopConfig[]>;

interface WorkshopConfigStore {
  loaded: boolean;
  loading: boolean;
  byCategory: ByCategory;
  load: (force?: boolean) => Promise<void>;
  resolve: (category: WorkshopConfigCategory, code?: string | null) => WorkshopConfig | undefined;
  upsertItem: (item: WorkshopConfig) => void;
  removeItem: (id: string) => void;
}

const emptyByCategory = (): ByCategory =>
  WORKSHOP_CONFIG_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = [];
    return acc;
  }, {} as ByCategory);

export const useWorkshopConfigStore = create<WorkshopConfigStore>((set, get) => ({
  loaded: false,
  loading: false,
  byCategory: emptyByCategory(),

  load: async (force = false) => {
    if (!force && (get().loaded || get().loading)) return;
    set({ loading: true });
    try {
      const res = await RepositoryRemote.workshopConfig.getAll();
      const data = (res.data?.data || {}) as Partial<ByCategory>;
      const filled = emptyByCategory();
      for (const cat of WORKSHOP_CONFIG_CATEGORIES) {
        filled[cat] = data[cat] || [];
      }
      set({ byCategory: filled, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  resolve: (category, code) => {
    if (!code) return undefined;
    return get().byCategory[category]?.find((i) => i.code === code);
  },

  upsertItem: (item: WorkshopConfig) => {
    const byCategory = { ...get().byCategory } as ByCategory;
    const cat = item.category as WorkshopConfigCategory;
    const list: WorkshopConfig[] = byCategory[cat] || [];
    const idx = list.findIndex((i: WorkshopConfig) => i._id === item._id);
    byCategory[cat] =
      idx === -1
        ? [...list, item]
        : list.map((i: WorkshopConfig, k: number) => (k === idx ? item : i));
    byCategory[cat].sort((a: WorkshopConfig, b: WorkshopConfig) => a.order - b.order);
    set({ byCategory });
  },

  removeItem: (id) => {
    const byCategory = { ...get().byCategory };
    for (const cat of WORKSHOP_CONFIG_CATEGORIES) {
      byCategory[cat] = byCategory[cat].filter((i) => i._id !== id);
    }
    set({ byCategory });
  },
}));
