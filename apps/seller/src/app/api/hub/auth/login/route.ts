import { NextResponse } from 'next/server';
import { apiBase, setHubCookies } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HUB_ROLES = new Set(['SuperAdmin', 'Admin']);

/**
 * Đăng nhập khu quản trị bằng tài khoản NHÂN VIÊN (`POST /auth/login` của NestJS,
 * `recaptchaToken` rỗng như app admin dev). Chỉ nhận vai SuperAdmin/Admin — vai khác
 * đăng nhập được ở app xưởng nhưng không có việc gì ở đây → 403, không ghi cookie.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string; rememberMe?: boolean };
  const upstream = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': req.headers.get('accept-language') ?? 'en' },
    body: JSON.stringify({ email: body.email, password: body.password, recaptchaToken: '', rememberMe: !!body.rememberMe }),
    cache: 'no-store',
  });
  const data = (await upstream.json().catch(() => ({}))) as { accessToken?: string; expiresIn?: number; message?: string };
  if (!upstream.ok || !data.accessToken) {
    return NextResponse.json({ success: false, message: data.message ?? 'Login failed' }, { status: upstream.ok ? 502 : upstream.status });
  }
  const me = await fetch(`${apiBase()}/auth/me`, { headers: { Authorization: `Bearer ${data.accessToken}` }, cache: 'no-store' });
  const meJson = (await me.json().catch(() => null)) as { data?: { role?: { name?: string }; fullName?: string } } | null;
  const roleName = meJson?.data?.role?.name ?? '';
  if (!HUB_ROLES.has(roleName)) return NextResponse.json({ success: false, message: 'forbidden-role', role: roleName }, { status: 403 });
  await setHubCookies({ accessToken: data.accessToken, expiresIn: data.expiresIn, persist: !!body.rememberMe });
  return NextResponse.json({ success: true, data: { user: meJson?.data } });
}
