import { createHash } from 'crypto';

/**
 * Design URL helpers — self-hosted R2 strategy.
 *
 * Pipeline:
 *   1. User paste URL → BE enqueue job
 *   2. Worker download → sharp nén → upload R2 với key deterministic theo hash
 *   3. URL render = `${R2_PUBLIC_BASE}/designs/{variant}/{hash}.webp`
 *
 * Hash quy ước:
 *   - Drive URL → driveId thẳng (10-128 chars, an toàn cho R2 key)
 *   - Non-Drive  → sha256(url).slice(0, 24)
 *
 * Lý do dùng hash:
 *   - Idempotent: cùng URL → cùng key → HEAD R2 skip dup.
 *   - Dedup tự nhiên giữa các đơn cùng dùng 1 design URL.
 */

const DRIVE_FILE_PATTERN = /\/file\/d\/([A-Za-z0-9_-]{10,128})/;
const DRIVE_ID_QUERY_PATTERN = /[?&]id=([A-Za-z0-9_-]{10,128})/;
const OWN_R2_PATH_PREFIX = '/designs/';

export function extractDriveId(url?: string): string | null {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('drive.google.com') && !url.includes('drive.usercontent.google.com')) {
    return null;
  }
  const m = url.match(DRIVE_FILE_PATTERN) ?? url.match(DRIVE_ID_QUERY_PATTERN);
  return m ? m[1] : null;
}

/**
 * Hash tag dùng làm R2 key. Drive → driveId; else sha256 short.
 */
export function hashForR2(sourceUrl: string): string {
  const driveId = extractDriveId(sourceUrl);
  if (driveId) return driveId;
  return createHash('sha256').update(sourceUrl).digest('hex').slice(0, 24);
}

export type R2Variant = 'preview' | 'thumb';

export function buildR2Url(publicBase: string, variant: R2Variant, hash: string): string {
  return `${publicBase}/designs/${variant}/${hash}.webp`;
}

export function r2KeyFor(variant: R2Variant, hash: string): string {
  return `designs/${variant}/${hash}.webp`;
}

/**
 * URL đã trỏ về R2 của mình → KHÔNG cần re-process. Tránh loop khi user
 * paste URL R2 cũ vào sheet rồi import lại.
 */
export function isOwnR2Url(url: string | undefined, publicBase: string): boolean {
  if (!url || !publicBase) return false;
  return url.startsWith(publicBase) && url.includes(OWN_R2_PATH_PREFIX);
}

/**
 * Drive download URL — usercontent endpoint không cần auth cho file đã
 * "Anyone with link can view". File > 100 MB Drive có thể trả HTML confirm
 * page (caller phải check content-type).
 */
export function buildDriveDownloadUrl(driveId: string): string {
  return `https://drive.usercontent.google.com/download?id=${driveId}&export=download&authuser=0`;
}
