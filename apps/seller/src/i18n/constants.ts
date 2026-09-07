/** Hằng i18n KHÔNG import react/i18next — dùng được ở Server Component + route handler + proxy. */
export type AppLanguage = 'vi' | 'en';
/** Mặc định EN — mirror `apps/web/src/i18n/index.ts` (`DEFAULT_LANGUAGE`). */
export const DEFAULT_LANGUAGE: AppLanguage = 'en';
/** Cookie ngôn ngữ — proxy đọc để gắn `Accept-Language` cho NestJS. */
export const LANG_COOKIE = 'onos_lang';

export function normalizeLanguage(v: string | null | undefined): AppLanguage {
  return v === 'vi' ? 'vi' : 'en';
}
