import type { User } from 'shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthStore {
  token: string | null;
  tokenExpiredAt: number;
  profile: User | null;
  loading: boolean;
  setToken: (data: string) => void;
  getToken: (isPublic?: boolean) => string | null;
  isAuthenticated: () => boolean;
  setTokenExpiredAt: (data: number) => void;
  clearToken: () => void;
  setProfile: (data: User) => void;
  setLoading: (data: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      tokenExpiredAt: 0,
      profile: null,
      loading: false,
      setToken: (data) => set({ token: data }),
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

        window.location.href = '/login';
      },
      setProfile: (data) => set({ profile: data }),
      setLoading: (data) => set({ loading: data }),
    }),
    {
      name: 'auth-store', // Name of the key in localStorage
    },
  ),
);
