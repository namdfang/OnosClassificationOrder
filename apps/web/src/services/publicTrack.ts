import { callApi } from '../apis';
import { CONFIG } from '../constants';

/**
 * Tra cứu đơn CÔNG KHAI (`/track/:productionId`) — KHÔNG cần đăng nhập.
 *
 * URL cố ý nằm dưới `/public/...` như catalog công khai: interceptor ở
 * `apis/index.tsx` gắn token khách hàng cho mọi request chứa `/customer/`, mà
 * trang này phục vụ cả người không có tài khoản (người mua cuối của khách).
 */
const getTrack = (code: string) => {
  return callApi(`/${CONFIG.API_VERSION}/public/track/${encodeURIComponent(code)}`, 'get');
};

export const publicTrack = { getTrack };
