import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'light' | 'dark';

interface ThemeStore {
  mode: ThemeMode;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'light',
      toggleMode: () => {
        const next = get().mode === 'light' ? 'dark' : 'light';
        set({ mode: next });
        applyThemeClass(next);
      },
      setMode: (mode) => {
        set({ mode });
        applyThemeClass(mode);
      },
    }),
    {
      name: 'printera-theme',
    },
  ),
);

function applyThemeClass(mode: ThemeMode) {
  if (mode === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// Initialize on load
const stored = JSON.parse(localStorage.getItem('printera-theme') || '{}');
if (stored?.state?.mode === 'dark') {
  document.documentElement.classList.add('dark');
}
