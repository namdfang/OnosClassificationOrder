import { z } from 'zod';

/** Biến thể file design trên CDN R2 (DesignStorage.md). Nest-free, xem `client/design-fields.ts`. */
export const DESIGN_CDN_VARIANTS = ['original', 'preview', 'thumb'] as const;
export type DesignCdnVariant = (typeof DESIGN_CDN_VARIANTS)[number];

const SHA256_HEX = /^[a-f0-9]{64}$/;
export const Sha256Zod = z.string().regex(SHA256_HEX, 'sha256 hex (64 ký tự) không hợp lệ');

/**
 * R2 object key cho 1 biến thể của 1 design (dùng chung API + worker).
 * Layout variant-first (`designs/thumb/<sha>`...) — cùng kiểu 2 folder
 * `designs/preview|thumb/` của module design-image cũ, dễ duyệt trên dashboard.
 */
export function designFileKey(sha256: string, variant: DesignCdnVariant): string {
  return variant === 'original' ? `designs/original/${sha256}` : `designs/${variant}/${sha256}.webp`;
}

/** URL CDN public cho 1 biến thể. `base` = R2_PUBLIC_BASE (không slash cuối). */
export function designCdnUrl(base: string, sha256: string, variant: DesignCdnVariant): string {
  return `${base.replace(/\/$/, '')}/${designFileKey(sha256, variant)}`;
}

const DESIGN_CDN_URL_PATTERN = /\/designs\/(original|preview|thumb)\/([a-f0-9]{64})(\.webp)?$/;

/** Trích sha256 từ 1 URL CDN design của hệ mình — không match → null. */
export function extractDesignSha(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(DESIGN_CDN_URL_PATTERN);
  return m?.[2] ?? null;
}

/**
 * Đổi biến thể ngay trên URL CDN (original ↔ preview ↔ thumb) — cho FE render
 * thumb/preview từ giá trị `designs.{k}` (luôn lưu URL original). URL không
 * phải CDN design của mình → trả null, caller fallback xử lý Drive như cũ.
 */
export function designVariantUrl(url: string | undefined | null, variant: DesignCdnVariant): string | null {
  const sha = extractDesignSha(url);
  if (!sha || !url) return null;
  return url.replace(DESIGN_CDN_URL_PATTERN, `/${designFileKey(sha, variant)}`);
}
