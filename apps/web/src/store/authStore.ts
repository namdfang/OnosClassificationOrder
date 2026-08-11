import type { User } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { PATHS } from '@/constants/paths';

import { AUTH_REMEMBER_KEY, AUTH_STORE_KEY, createSessionPersist } from './sessionPersist';

/**
 * Profile trả về từ BE getMe: User + virtual `role` đã populate
 * (name có thể là custom role nên để string thay vì RoleType).
 */
export type UserProfile = User & {
    role?: { name: string; permissionCodes?: string[]; isSystem?: boolean };
};

const sessionPersist = createSessionPersist(AUTH_STORE_KEY, AUTH_REMEMBER_KEY);

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
    /** Xóa phiên KHÔNG điều hướng — dùng khi dọn phiên hết hạn lúc khởi động. */
    resetSession: () => void;
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
                // storage.setItem cần đọc marker mới nhất để route đúng chỗ.
                sessionPersist.setRemembered(remember);
                set({ token: data });
            },
            // `isPublic` giữ lại ở chữ ký cho call-site tự mô tả (request tới
            // route public vẫn đi được khi không có token) — hết hạn thì luôn
            // trả null. KHÔNG dọn state ở đây: getToken chạy trong lúc render
            // (isAuthenticated) và trong axios interceptor, set() ở đây sẽ gây
            // re-render giữa chừng. Việc dọn làm 1 lần lúc rehydrate
            // (onRehydrateStorage) hoặc khi BE trả 401 (clearToken).
            getToken: () => {
                if (get().tokenExpiredAt > Date.now()) {
                    return get().token;
                }

                return null;
            },
            isAuthenticated: () => {
                return get().getToken() !== null;
            },
            setTokenExpiredAt: (data) => set({ tokenExpiredAt: data }),
            resetSession: () => {
                set({ token: null, tokenExpiredAt: 0, profile: null, loading: false });
                sessionPersist.clearAll();
            },
            clearToken: () => {
                get().resetSession();

                window.location.href = PATHS.LOGIN;
            },
            setProfile: (data) => set({ profile: data }),
            setLoading: (data) => set({ loading: data }),
        }),
        {
            name: AUTH_STORE_KEY, // key trong localStorage HOẶC sessionStorage (xem sessionPersist)
            storage: createJSONStorage(() => sessionPersist.storage),
            // CHỈ persist dữ liệu phiên. `loading` là state tức thời — persist nó
            // thì reload đúng lúc đang loading sẽ rehydrate `loading=true` vĩnh viễn.
            partialize: (state) => ({
                token: state.token,
                tokenExpiredAt: state.tokenExpiredAt,
                profile: state.profile,
            }),
            // Hydrate do `main.tsx` chủ động gọi SAU khi xin phiên từ tab khác
            // (requestSessionHandoff) — nếu để tự hydrate lúc import module thì
            // blob chưa kịp về, tab mới sẽ bị đá ra trang đăng nhập.
            skipHydration: true,
            // Phiên đã hết hạn thì không giữ lại token/profile cũ trong storage.
            onRehydrateStorage: () => (state) => {
                if (state && state.token && state.tokenExpiredAt <= Date.now()) {
                    state.resetSession();
                }
            },
        },
    ),
);
