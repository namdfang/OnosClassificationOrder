import { NextResponse, type NextRequest } from 'next/server';
import { apiBase, clearSessionCookies, readLang, readToken } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Proxy same-origin: browser gọi `/api/v1/<path>` → server gọi `${API_INTERNAL_URL}/<path>` kèm
 * `Authorization: Bearer` từ cookie httpOnly. 401 từ BE → xóa cookie, client (`use-api.ts`) tự về /login.
 * Body stream thẳng (JSON + multipart), header hop-by-hop bị bỏ.
 */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'host', 'content-length', 'cookie']);

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${apiBase()}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
  });
  const token = await readToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (!headers.has('accept-language')) headers.set('accept-language', await readLang());

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // @ts-expect-error — Node fetch cần duplex khi stream body request
    duplex: hasBody ? 'half' : undefined,
    redirect: 'manual',
    cache: 'no-store',
  });

  if (upstream.status === 401) await clearSessionCookies();

  const resHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'content-encoding') resHeaders.set(k, v);
  });
  return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders });
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
