import type { StartImpersonationDto } from 'shared';

import { PATHS } from '@/constants/paths';

import { useAuthStore } from '@/store/authStore';
import { useCustomerAuthStore } from '@/store/customerAuthStore';
import { AUTH_REMEMBER_KEY } from '@/store/sessionPersist';

import { RepositoryRemote } from '@/services';

/**
 * BẮT ĐẦU phiên mạo danh (AUTH-1) — dùng chung cho trang `/impersonate` và nút
 * truy cập nhanh trên thanh nav (AUTH-2).
 *
 * Tách khỏi `utils/impersonation.ts` (phần THOÁT) là cố ý: file kia được
 * `apis/index.tsx` import để xử lý mã hết hạn nên KHÔNG được chạm tới
 * `RepositoryRemote` (vòng import + gọi lại chính interceptor đang chạy). Chiều
 * bắt đầu thì ngược lại — không ai gọi từ interceptor, nên đi qua
 * `RepositoryRemote` như mọi lời gọi API khác.
 */

/** 1 tài khoản mạo danh được — gộp 2 nguồn (nhân viên / khách hàng) về một hình dạng. */
export interface ImpersonationCandidate {
  targetType: 'user' | 'customer';
  id: string;
  /** Dòng đầu — tên hiển thị. */
  title: string;
  /** Dòng phụ — email / SKU / vai trò. */
  subtitle: string;
  inactive: boolean;
}

/** Đọc marker "Ghi nhớ đăng nhập" hiện tại để `setToken` không đổi chỗ lưu phiên. */
function currentRemember(): boolean {
  try {
    return localStorage.getItem(AUTH_REMEMBER_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Gọi `POST /auth/impersonate`, ghi token vào ĐÚNG store rồi điều hướng.
 *
 * Đoạn ghi token là chỗ dễ sai nhất của tính năng này nên CHỈ tồn tại ở đây:
 * mạo danh khách ghi vào `customerAuthStore` và giữ nguyên phiên nhân viên thật
 * của SuperAdmin trong `authStore` (`BR-14`); mạo danh nhân viên thì ghi đè
 * `authStore` nhưng phải giữ marker "ghi nhớ đăng nhập".
 *
 * Ném lỗi ra ngoài để nơi gọi tự `handleAxiosError` — backend mới là hàng rào
 * (chặn không đủ quyền, chặn mạo danh lồng nhau), FE chỉ hiện lỗi đó.
 */
export async function startImpersonation(
  target: Pick<ImpersonationCandidate, 'targetType' | 'id'>,
): Promise<void> {
  const payload: StartImpersonationDto = { targetType: target.targetType, targetId: target.id };
  const res = await RepositoryRemote.impersonate.start(payload);
  const data = res.data?.data as
    | { accessToken: string; expiresIn: number; impersonating?: { targetType: 'user' | 'customer' } }
    | undefined;
  if (!data?.accessToken) throw new Error('missing token');

  // Điều hướng theo `targetType` do BE trả, KHÔNG tự đoán từ id (`BR-5`).
  const kind = data.impersonating?.targetType ?? target.targetType;
  const expiredAt = Date.now() + (data.expiresIn ?? 0) * 1000;

  if (kind === 'customer') {
    const store = useCustomerAuthStore.getState();
    store.setToken(data.accessToken);
    store.setTokenExpiredAt(expiredAt);
    window.location.href = PATHS.CUSTOMER_ORDERS;
    return;
  }

  const store = useAuthStore.getState();
  store.setToken(data.accessToken, currentRemember());
  store.setTokenExpiredAt(expiredAt);
  window.location.href = PATHS.ORDERS_WORKSHOP;
}
