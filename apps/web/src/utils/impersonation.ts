import axios from 'axios';

import { CONFIG } from '@/constants';
import { PATHS } from '@/constants/paths';

import { useAuthStore } from '@/store/authStore';
import { useCustomerAuthStore } from '@/store/customerAuthStore';
import { AUTH_REMEMBER_KEY } from '@/store/sessionPersist';

/**
 * Thoát phiên mạo danh (AUTH-1) — dùng chung cho **nút "Thoát mạo danh"** ở dải
 * cảnh báo và cho **nhánh `error.impersonationExpired`** trong axios interceptor.
 *
 * Cố ý gọi bằng một `axios` TRẦN chứ không qua `RepositoryRemote`:
 *  1. `apis/index.tsx` sẽ import module này để xử lý mã hết hạn — đi qua
 *     `apiAxios` là tạo vòng import, và tệ hơn là **gọi lại chính interceptor
 *     đang chạy** (request `stop` hỏng lại rơi vào nhánh xử lý hỏng → đệ quy).
 *  2. Endpoint `stop` chấp nhận cả token ĐÃ HẾT HẠN (chỉ xác thực chữ ký), nên
 *     phải gửi token thô — `getToken()` trả `null` khi quá hạn, đúng lúc cần nó
 *     nhất thì lại không có.
 */

/** Đọc marker "Ghi nhớ đăng nhập" hiện tại để `setToken` không đổi chỗ lưu phiên. */
function currentRemember(): boolean {
  try {
    return localStorage.getItem(AUTH_REMEMBER_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Phiên mạo danh đang nằm ở store nào. Mạo danh KHÁCH ghi token vào
 * `customerAuthStore` và **không đụng** `authStore` (phiên nhân viên thật của
 * SuperAdmin còn nguyên); mạo danh NHÂN VIÊN thì ghi đè `authStore`.
 */
function activeImpersonationToken(): string | null {
  const customer = useCustomerAuthStore.getState();
  if (customer.profile?.impersonatedBy) return customer.token;
  return useAuthStore.getState().token;
}

export function isImpersonating(): boolean {
  return (
    !!useAuthStore.getState().profile?.impersonatedBy || !!useCustomerAuthStore.getState().profile?.impersonatedBy
  );
}

/** Chống gọi `stop` nhiều lần khi hàng loạt request cùng hỏng một lúc. */
let exiting: Promise<boolean> | null = null;

/**
 * Gọi `POST /auth/impersonate/stop`, ghi token SuperAdmin mới vào `authStore`,
 * dọn `customerAuthStore`, rồi đưa về màn hình Mạo danh.
 *
 * Trả `false` khi không cứu được phiên — nơi gọi tự quyết định bước sau (dải
 * cảnh báo hiện lỗi, interceptor rơi về `clearToken` như cũ).
 */
export function exitImpersonation(): Promise<boolean> {
  if (exiting) return exiting;

  exiting = (async () => {
    const token = activeImpersonationToken();
    if (!token) return false;

    try {
      const res = await axios.post(
        `${CONFIG.API_URL}/${CONFIG.API_VERSION}/auth/impersonate/stop`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = res.data?.data as { accessToken?: string; expiresIn?: number } | undefined;
      if (!data?.accessToken) return false;

      // Dọn phiên khách TRƯỚC: nếu đang mạo danh khách thì token trong store đó
      // đã hết vai trò, để lại sẽ thành một phiên khách nửa vời không của ai.
      useCustomerAuthStore.getState().resetSession();

      const auth = useAuthStore.getState();
      // Giữ nguyên marker "ghi nhớ" — `setToken` mặc định `false` và sẽ ÂM THẦM
      // chuyển blob phiên từ localStorage sang sessionStorage, tức huỷ lựa chọn
      // ghi nhớ đăng nhập của chính SuperAdmin.
      auth.setToken(data.accessToken, currentRemember());
      auth.setTokenExpiredAt(Date.now() + (data.expiresIn ?? 0) * 1000);
      return true;
    } catch {
      return false;
    } finally {
      exiting = null;
    }
  })();

  return exiting;
}

/** Điều hướng cứng về màn hình Mạo danh — dùng sau khi thoát thành công. */
export function goToImpersonateHome(): void {
  window.location.href = PATHS.IMPERSONATE;
}
