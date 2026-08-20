/**
 * Hostname chạy trên chính máy dev: localhost / loopback / IP LAN riêng tư.
 * Cùng bộ dải với `isLocalDevOrigin()` ở `apps/api/src/main-nest.ts` — sửa bên
 * này thì phải sửa cả bên kia, nếu không CORS và baseURL sẽ lệch nhau.
 */
const LOCAL_HOSTNAME =
  /^(localhost|127\.0\.0\.1|\[?::1\]?|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/;

/**
 * Đổi hostname của trang thành hostname của API theo quy ước tunnel:
 * `<sub>.<domain>` → `api-<sub>.<domain>` (vd `task.lcndev.online` →
 * `api-task.lcndev.online`). Cloudflare Tunnel cần 2 ingress trỏ về 2 cổng
 * local khác nhau (web 5173, API 3007) nên KHÔNG dùng chung 1 hostname được.
 *
 * Apex domain (chỉ 2 nhãn, không có sub) thì lùi về `api.<domain>`.
 */
function toApiHostname(hostname: string): string {
  const labels = hostname.split('.');

  if (labels.length < 3) return `api.${hostname}`;
  if (labels[0].startsWith('api-')) return hostname;

  return `api-${labels[0]}.${labels.slice(1).join('.')}`;
}

/**
 * Base URL của API.
 *
 * - **Production build** (`import.meta.env.DEV === false`): luôn dùng đúng
 *   `VITE_API_URL` như trước. Trị rỗng = deploy cùng domain → request đi
 *   tương đối `/api/v1/...`.
 * - **Dev qua localhost/LAN**: cũng dùng `VITE_API_URL`
 *   (`http://localhost:3007/api`).
 * - **Dev qua domain thật** (Cloudflare Tunnel trỏ vào Vite): `localhost:3007`
 *   không tồn tại với máy khách bên ngoài, nên tự chuyển sang
 *   `api-<sub>.<domain>`. Đặt `VITE_TUNNEL_API_URL` nếu tunnel API nằm ở
 *   hostname không theo quy ước này.
 *
 * Trả về base KHÔNG gồm `/v1` — services tự nối `CONFIG.API_VERSION`.
 */
function resolveApiUrl(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

  if (!import.meta.env.DEV || typeof window === 'undefined') return configured;

  const { hostname, protocol } = window.location;
  if (!hostname || LOCAL_HOSTNAME.test(hostname)) return configured;

  const override = import.meta.env.VITE_TUNNEL_API_URL as string | undefined;
  if (override) return override.replace(/\/+$/, '');

  return `${protocol}//${toApiHostname(hostname)}/api`;
}

export const CONFIG = {
  API_URL: resolveApiUrl(),
  API_VERSION: 'v1',
  DEFAULT_IMAGE: 'https://via.placeholder.com/150',
  DIAMOND_TIER_PRICE: '$10',
  PRIMARY_COLOR: '#6366F1',
  PRIMARY_BACKGROUND_COLOR: 'rgba(99, 102, 241, 0.1)',
  CHECK_TRACKING_URL: 'https://t.17track.net/en?nums=',
  DISABLE_COLOR: '#D1D5DB',
  DISABLE_BORDER_COLOR: '#E5E7EB',
  DISABLE_BACKGROUND_COLOR: '#FFFFFF',
};
