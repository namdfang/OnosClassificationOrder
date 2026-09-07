import { NextResponse } from 'next/server';
import { apiBase, setSessionCookies } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Đăng nhập: gọi NestJS `POST customer/auth/login`, giữ token trong cookie httpOnly, trả `user`.
 * Lỗi từ BE (401/423/429…) forward nguyên mã + body để client hiện đúng câu.
 */
export async function POST(req: Request) {
  let body: { userEmail?: string; password?: string; rememberMe?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  const upstream = await fetch(`${apiBase()}/customer/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': req.headers.get('accept-language') ?? 'en' },
    body: JSON.stringify({ userEmail: body.userEmail, password: body.password, rememberMe: !!body.rememberMe }),
    cache: 'no-store',
  });
  const text = await upstream.text();
  let data: { accessToken?: string; expiresIn?: number; user?: unknown; message?: string } = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* body không phải JSON → coi như lỗi upstream */
  }
  if (!upstream.ok || !data.accessToken) {
    return NextResponse.json(
      { success: false, message: data.message ?? 'Login failed' },
      { status: upstream.ok ? 502 : upstream.status },
    );
  }
  await setSessionCookies({ accessToken: data.accessToken, expiresIn: data.expiresIn, persist: !!body.rememberMe });
  return NextResponse.json({ success: true, data: { user: data.user, expiresIn: data.expiresIn } });
}
