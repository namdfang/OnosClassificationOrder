import type { StartImpersonationDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

/**
 * Mạo danh tài khoản khác — CHỈ SuperAdmin (AUTH-1). Xem
 * [`.devtasks/ui/AUTH-1.md`](../../../../.devtasks/ui/AUTH-1.md) và
 * [`.devtasks/design/AUTH-1.md`](../../../../.devtasks/design/AUTH-1.md).
 */
const start = (form: StartImpersonationDto) => {
  return callApi(`/${CONFIG.API_VERSION}/auth/impersonate`, 'post', form);
};

/**
 * Thoát phiên mạo danh → nhận token SuperAdmin MỚI (`BR-9`: không bắt đăng nhập
 * lại). Endpoint này **không đi qua guard `jwt` thường và chấp nhận cả token đã
 * HẾT HẠN** (chỉ xác thực chữ ký) — nhờ vậy `AC-09` mới đạt được: token hết hạn
 * mà đòi token còn hạn để thoát thì không có đường nào về tài khoản thật.
 * Nghĩa là cứ gọi thẳng với token mạo danh đang có, kể cả ngay sau khi một
 * request vừa trả về `error.impersonationExpired`.
 */
const stop = () => {
  return callApi(`/${CONFIG.API_VERSION}/auth/impersonate/stop`, 'post');
};

/**
 * AUTH-3 — đường thoát THẬT mà giao diện đang dùng nằm ở
 * `utils/impersonation.ts` (`exitImpersonation()`): nó gọi bằng axios trần để
 * tránh vòng import với interceptor, và tự chọn giữa đường nhân viên ở trên với
 * đường khách `customer/auth/impersonate/stop`. Giữ `stop` ở đây cho đủ bộ
 * service, đừng gọi thẳng nó cho phiên mạo danh KHÁCH — `RolesGuard` chặn 403.
 */

export const impersonate = { start, stop };
