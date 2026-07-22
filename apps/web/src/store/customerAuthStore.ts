import type { Customer } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { PATHS } from '@/constants/paths';

/**
 * Store auth RIÊNG cho Customer Portal — tách biệt hoàn toàn khỏi `authStore`
 * (nhân viên) để 1 trình duyệt có thể đăng nhập cả 2 vai trò cùng lúc mà
 * không xung đột token.
 */
const REMEMBER_KEY = 'printsel-customer-remember-me';

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

interface CustomerAuthStore {
  token: string | null;
  tokenExpiredAt: number;
  profile: Customer | null;
  setToken: (data: string, remember?: boolean) => void;
  getToken: () => string | null;
  isAuthenticated: () => boolean;
  setTokenExpiredAt: (data: number) => void;
  clearToken: () => void;
  setProfile: (data: Customer) => void;
}

export const useCustomerAuthStore = create<CustomerAuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      tokenExpiredAt: 0,
      profile: null,
      setToken: (data, remember = false) => {
        localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
        set({ token: data });
      },
      getToken: () => {
        if (get().tokenExpiredAt > Date.now()) {
          return get().token;
        }
        return null;
      },
      isAuthenticated: () => get().getToken() !== null,
      setTokenExpiredAt: (data) => set({ tokenExpiredAt: data }),
      clearToken: () => {
        set({ token: null, tokenExpiredAt: 0, profile: null });
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem('customer-auth-store');
        sessionStorage.removeItem('customer-auth-store');
        window.location.href = PATHS.CUSTOMER_LOGIN;
      },
      setProfile: (data) => set({ profile: data }),
    }),
    {
      name: 'customer-auth-store',
      storage: createJSONStorage(() => dynamicStorage),
    },
  ),
);
