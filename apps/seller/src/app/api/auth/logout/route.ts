import { NextResponse } from 'next/server';
import { apiBase, clearSessionCookies, readToken } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Đăng xuất: xóa cookie. Nếu phiên là MẠO DANH (admin xem thay khách) → gọi
 * `customer/auth/impersonate/stop` để BE ghi audit, rồi trả `redirectTo` = app admin.
 */
export async function POST() {
  const token = await readToken();
  let redirectTo = '/login';
  if (token) {
    try {
      const me = await fetch(`${apiBase()}/customer/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = (await me.json().catch(() => null)) as { data?: { impersonatedBy?: unknown } } | null;
      if (json?.data?.impersonatedBy) {
        await fetch(`${apiBase()}/customer/auth/impersonate/stop`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }).catch(() => undefined);
        redirectTo = process.env.NEXT_PUBLIC_ADMIN_URL || '/login';
      }
    } catch {
      /* BE không trả lời → vẫn xóa cookie phía mình */
    }
  }
  await clearSessionCookies();
  return NextResponse.json({ success: true, data: { redirectTo } });
}
