import { NextResponse, type NextRequest } from 'next/server';

const TOKEN_COOKIE = 'onos_seller_token';
const HUB_TOKEN_COOKIE = 'onos_hub_token';
const PUBLIC_PREFIXES = ['/login', '/track', '/auth/handoff', '/api/auth', '/api/v1/public', '/hub/login'];

/**
 * Chưa có cookie phiên → về `/login?callbackUrl=`. Hết hạn thật sự do BE quyết (401 qua proxy);
 * ở đây chỉ chặn sớm trang cần đăng nhập để không nháy giao diện.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.next(); // proxy tự trả 401
  // Khu quản trị `/hub/*` — phiên NHÂN VIÊN (cookie riêng), login riêng.
  if (pathname === '/hub' || pathname.startsWith('/hub/')) {
    if (req.cookies.get(HUB_TOKEN_COOKIE)?.value) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = '/hub/login';
    url.search = `?callbackUrl=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  const hasToken = !!req.cookies.get(TOKEN_COOKIE)?.value;
  if (hasToken) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname !== '/' ? `?callbackUrl=${encodeURIComponent(pathname + req.nextUrl.search)}` : '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json).*)'],
};
