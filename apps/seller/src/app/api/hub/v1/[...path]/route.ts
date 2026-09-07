import { clearHubCookies, readHubToken } from '@/lib/server/api';
import { createProxyHandler } from '@/lib/server/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Proxy phiên NHÂN VIÊN (khu `/hub`): `/api/hub/v1/<path>` → NestJS với cookie `onos_hub_token`. */
const handle = createProxyHandler({ readToken: readHubToken, onUnauthorized: clearHubCookies });
export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
