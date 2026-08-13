import type { Customer } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { PATHS } from '@/constants/paths';

import { createSessionPersist, CUSTOMER_REMEMBER_KEY, CUSTOMER_STORE_KEY } from './sessionPersist';

/**
 * Store auth RIÊNG cho Customer Portal — tách biệt hoàn toàn khỏi `authStore`
 * (nhân viên) để 1 trình duyệt có thể đăng nhập cả 2 vai trò cùng lúc mà
 * không xung đột token.
 */
const sessionPersist = createSessionPersist(CUSTOMER_STORE_KEY, CUSTOMER_REMEMBER_KEY);

interface CustomerAuthStore {
    token: string | null;
    tokenExpiredAt: number;
    profile: Customer | null;
    setToken: (data: string, remember?: boolean) => void;
    getToken: () => string | null;
    isAuthenticated: () => boolean;
    setTokenExpiredAt: (data: number) => void;
    /** Xóa phiên KHÔNG điều hướng — dùng khi dọn phiên hết hạn lúc khởi động. */
    resetSession: () => void;
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
                sessionPersist.setRemembered(remember);
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
            resetSession: () => {
                set({ token: null, tokenExpiredAt: 0, profile: null });
                sessionPersist.clearAll();
            },
            clearToken: () => {
                get().resetSession();

                window.location.href = PATHS.CUSTOMER_LOGIN;
            },
            setProfile: (data) => set({ profile: data }),
        }),
        {
            name: CUSTOMER_STORE_KEY,
            storage: createJSONStorage(() => sessionPersist.storage),
            partialize: (state) => ({
                token: state.token,
                tokenExpiredAt: state.tokenExpiredAt,
                profile: state.profile,
            }),
            // Xem authStore — hydrate do main.tsx gọi sau khi xin phiên tab khác.
            skipHydration: true,
            onRehydrateStorage: () => (state) => {
                if (state && state.token && state.tokenExpiredAt <= Date.now()) {
                    state.resetSession();
                }
            },
        },
    ),
);
