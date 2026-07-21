import type { User } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/**
 * Profile trả về từ BE getMe: User + virtual `role` đã populate
 * (name có thể là custom role nên để string thay vì RoleType).
 */
export type UserProfile = User & {
  role?: { name: string; permissionCodes?: string[]; isSystem?: boolean };
};

/**
 * Marker "Ghi nhớ đăng nhập" — sống RIÊNG ở localStorage (ngoài blob persist)
 * vì cần đọc được nó trước khi biết nên route blob vào storage nào.
 */
const REMEMBER_KEY = 'printsel-remember-me';

/**
 * Route việc đọc/ghi state persist giữa `localStorage` (remember=true — sống
 * qua restart trình duyệt) và `sessionStorage` (remember=false — mất khi đóng
 * trình duyệt). Chỉ 1 trong 2 có data tại 1 thời điểm — mỗi lần ghi tự dọn cái
 * còn lại để tránh bản cũ còn sót.
 */
const dynamicStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name) ?? sessionStorage.getItem(name),
  setItem: (name, value) => {
    const remember = localStorage.getItem(REMEMBER_KEY) === '1';
    (remember ? localStorage : sessionStorage).setItem(name, value);
    (remember ? sessionStorage : localStorage).removeItem(name);
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};

interface AuthStore {
  token: string | null;
  tokenExpiredAt: number;
  profile: UserProfile | null;
  loading: boolean;
  /** `remember=true` → persist qua localStorage (sống qua restart trình duyệt);
   *  `false` → sessionStorage (mất khi đóng trình duyệt). */
  setToken: (data: string, remember?: boolean) => void;
  getToken: (isPublic?: boolean) => string | null;
  isAuthenticated: () => boolean;
  setTokenExpiredAt: (data: number) => void;
  clearToken: () => void;
  setProfile: (data: UserProfile) => void;
  setLoading: (data: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      tokenExpiredAt: 0,
      profile: null,
      loading: false,
      setToken: (data, remember = false) => {
        // Set marker TRƯỚC khi set() — persist middleware ghi ngay sau đó,
        // dynamicStorage.setItem cần đọc marker mới nhất để route đúng chỗ.
        localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
        set({ token: data });
      },
      getToken: (isPublic = false) => {
        if (get().tokenExpiredAt > Date.now()) {
          return get().token;
        }

        if (!isPublic) {
          // get().clearToken();
        }

        return null;
      },
      isAuthenticated: () => {
        return get().getToken() !== null;
      },
      setTokenExpiredAt: (data) => set({ tokenExpiredAt: data }),
      clearToken: () => {
        set({ token: null, tokenExpiredAt: 0 });
        set({ profile: null });
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem('auth-store');
        sessionStorage.removeItem('auth-store');

        window.location.href = '/login';
      },
      setProfile: (data) => set({ profile: data }),
      setLoading: (data) => set({ loading: data }),
    }),
    {
      name: 'auth-store', // Name of the key trong localStorage HOẶC sessionStorage (xem dynamicStorage)
      storage: createJSONStorage(() => dynamicStorage),
    },
  ),
);
