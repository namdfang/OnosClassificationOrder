import 'server-only';
import { cookies } from 'next/headers';

/** Cookie phiên seller — httpOnly, JS không đọc được; proxy dịch thành Bearer. */
export const TOKEN_COOKIE = 'onos_seller_token';
/** Mốc hết hạn (ms epoch) — cookie thường để client biết còn phiên hay không. */
export const EXP_COOKIE = 'onos_seller_exp';
export const LANG_COOKIE = 'onos_lang';

export function apiBase(): string {
  const base = process.env.API_INTERNAL_URL;
  if (!base) throw new Error('API_INTERNAL_URL is not set');
  return base.replace(/\/+$/, '');
}

export function isSecureCookie(): boolean {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://');
}

export interface SessionCookieInput {
  accessToken: string;
  /** Giây — từ BE (`expiresIn`); rememberMe → cookie sống bằng token, không thì cookie phiên. */
  expiresIn?: number;
  persist: boolean;
}

export async function setSessionCookies({ accessToken, expiresIn, persist }: SessionCookieInput) {
  const jar = await cookies();
  const ttl = Math.max(60, Math.floor(expiresIn ?? 24 * 60 * 60));
  const common = { path: '/', sameSite: 'lax' as const, secure: isSecureCookie() };
  jar.set(TOKEN_COOKIE, accessToken, { ...common, httpOnly: true, ...(persist ? { maxAge: ttl } : {}) });
  jar.set(EXP_COOKIE, String(Date.now() + ttl * 1000), { ...common, httpOnly: false, ...(persist ? { maxAge: ttl } : {}) });
}

export async function clearSessionCookies() {
  const jar = await cookies();
  const common = { path: '/', sameSite: 'lax' as const, secure: isSecureCookie(), maxAge: 0 };
  jar.set(TOKEN_COOKIE, '', { ...common, httpOnly: true });
  jar.set(EXP_COOKIE, '', { ...common, httpOnly: false });
}

export async function readToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(TOKEN_COOKIE)?.value || null;
}

export async function readLang(): Promise<'vi' | 'en'> {
  const jar = await cookies();
  return jar.get(LANG_COOKIE)?.value === 'vi' ? 'vi' : 'en';
}

// ── Khu quản trị `/hub` (nhân viên Admin/SuperAdmin) — phiên RIÊNG, cookie riêng ──
export const HUB_TOKEN_COOKIE = 'onos_hub_token';
export const HUB_EXP_COOKIE = 'onos_hub_exp';

export async function setHubCookies({ accessToken, expiresIn, persist }: SessionCookieInput) {
  const jar = await cookies();
  const ttl = Math.max(60, Math.floor(expiresIn ?? 12 * 60 * 60));
  const common = { path: '/', sameSite: 'lax' as const, secure: isSecureCookie() };
  jar.set(HUB_TOKEN_COOKIE, accessToken, { ...common, httpOnly: true, ...(persist ? { maxAge: ttl } : {}) });
  jar.set(HUB_EXP_COOKIE, String(Date.now() + ttl * 1000), { ...common, httpOnly: false, ...(persist ? { maxAge: ttl } : {}) });
}

export async function clearHubCookies() {
  const jar = await cookies();
  const common = { path: '/', sameSite: 'lax' as const, secure: isSecureCookie(), maxAge: 0 };
  jar.set(HUB_TOKEN_COOKIE, '', { ...common, httpOnly: true });
  jar.set(HUB_EXP_COOKIE, '', { ...common, httpOnly: false });
}

export async function readHubToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(HUB_TOKEN_COOKIE)?.value || null;
}
