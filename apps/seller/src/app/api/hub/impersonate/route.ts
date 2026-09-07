import { NextResponse } from 'next/server';
import { apiBase, readHubToken, setSessionCookies } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Xem với tư cách seller" ngay trong app: token nhân viên → `POST /auth/impersonate`
 * (SuperAdmin, AUTH-1) → token khách → cookie phiên khách (không persist). Phiên nhân viên
 * (cookie hub) GIỮ NGUYÊN nên thoát mạo danh quay về `/hub/sellers` được ngay.
 */
export async function POST(req: Request) {
  const hubToken = await readHubToken();
  if (!hubToken) return NextResponse.json({ success: false, message: 'Not signed in' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { customerId?: string };
  if (!body.customerId) return NextResponse.json({ success: false, message: 'Missing customerId' }, { status: 400 });
  const upstream = await fetch(`${apiBase()}/auth/impersonate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hubToken}` },
    body: JSON.stringify({ targetType: 'customer', targetId: body.customerId }),
    cache: 'no-store',
  });
  const json = (await upstream.json().catch(() => ({}))) as { data?: { accessToken?: string; expiresIn?: number }; message?: string };
  if (!upstream.ok || !json.data?.accessToken) {
    return NextResponse.json({ success: false, message: json.message ?? 'Impersonation failed' }, { status: upstream.ok ? 502 : upstream.status });
  }
  await setSessionCookies({ accessToken: json.data.accessToken, expiresIn: json.data.expiresIn, persist: false });
  return NextResponse.json({ success: true });
}
