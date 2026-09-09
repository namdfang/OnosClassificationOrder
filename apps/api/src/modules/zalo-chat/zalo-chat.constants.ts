/**
 * Màn chat Zalo nhúng trong OnosFactory — hằng số dùng chung giữa controller
 * (cấp phiên) và proxy (đọc phiên).
 */

/**
 * Tiền tố đường dẫn proxy. KHÔNG đổi được: gói giao diện của nhà cung cấp gọi
 * thẳng `/api/zalo-multi/...` ở 8 chỗ trong mã đã build, nên app phải phục vụ
 * đúng đường này. Cũng vì thế nó nằm NGOÀI tiền tố `api/v1` của API.
 */
export const ZALO_PROXY_PREFIX = '/api/zalo-multi';

/**
 * Tiền tố khu Telegram (engine 20260909 / gói 1.44.1 trở đi). Giao diện
 * `TelegramWorkspace` gọi thẳng `/api/telegram/...`, cùng khuôn với Zalo, nên
 * app phải phục vụ đúng đường này và cũng nằm NGOÀI tiền tố `api/v1`.
 *
 * Dùng CHUNG một factory proxy với Zalo (`enginePrefix`), không chép lại phần
 * ký HMAC và chuyển tiếp — hai bản chép tay là hai chỗ lệch mỗi lần vendor ra
 * bản mới.
 */
export const TELEGRAM_PROXY_PREFIX = '/api/telegram';

/** Hai đường proxy dùng chung một cookie phiên. */
export const ZALO_COOKIE_PATHS = [ZALO_PROXY_PREFIX, TELEGRAM_PROXY_PREFIX] as const;

/**
 * Cookie mang danh tính người dùng cho các lời gọi của SDK.
 *
 * Vì sao phải có cookie thay vì dùng JWT như mọi API khác: SDK gọi bằng
 * `fetch(..., { credentials: 'same-origin' })` và KHÔNG gắn header
 * `Authorization` — mã đã build, không sửa được. Nên trang chat đổi JWT lấy một
 * cookie ngắn hạn, phạm vi hẹp đúng `ZALO_PROXY_PREFIX`.
 */
export const ZALO_SESSION_COOKIE = 'onos_zalo';

/** Hạn phiên chat (giây). Hết hạn thì trang tự xin lại, người dùng không thấy gì. */
export const ZALO_SESSION_TTL_SEC = 8 * 60 * 60;
