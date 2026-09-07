import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { apiBase, readLang } from '@/lib/server/api';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'host', 'content-length', 'cookie']);

interface ProxyOptions {
  readToken: () => Promise<string | null>;
  /** BE trả 401 → xóa cookie của phiên tương ứng. */
  onUnauthorized: () => Promise<void>;
}

/**
 * Proxy same-origin → NestJS, gắn Bearer từ cookie httpOnly của phiên (khách `/api/v1/*`
 * hoặc nhân viên `/api/hub/v1/*`). Body stream thẳng, bỏ header hop-by-hop.
 */
export function createProxyHandler({ readToken, onUnauthorized }: ProxyOptions) {
  return async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
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
    if (upstream.status === 401) await onUnauthorized();
    const resHeaders = new Headers();
    upstream.headers.forEach((v, k) => {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'content-encoding') resHeaders.set(k, v);
    });
    return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders });
  };
}
