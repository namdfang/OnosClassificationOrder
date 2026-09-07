import { clearSessionCookies, readToken } from '@/lib/server/api';
import { createProxyHandler } from '@/lib/server/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Proxy phiên KHÁCH: `/api/v1/<path>` → `${API_INTERNAL_URL}/<path>` với cookie `onos_seller_token`. */
const handle = createProxyHandler({ readToken, onUnauthorized: clearSessionCookies });
export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
