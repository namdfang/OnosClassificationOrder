import { NextResponse } from 'next/server';
import { apiBase, setSessionCookies } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin bấm "Xem với tư cách khách" ở `apps/web` → chuyển sang
 * `/auth/handoff#token=…&exp=…` (fragment không lọt access log) → trang đó POST vào đây.
 * Xác minh token bằng chính `customer/auth/me` trước khi ghi cookie — token rác không tạo phiên.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string; exp?: number };
  if (!body.token) return NextResponse.json({ success: false, message: 'Missing token' }, { status: 400 });
  const me = await fetch(`${apiBase()}/customer/auth/me`, {
    headers: { Authorization: `Bearer ${body.token}` },
    cache: 'no-store',
  });
  if (!me.ok) return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 401 });
  const expiresIn = body.exp ? Math.max(60, Math.floor((body.exp - Date.now()) / 1000)) : undefined;
  await setSessionCookies({ accessToken: body.token, expiresIn, persist: false });
  return NextResponse.json({ success: true });
}
