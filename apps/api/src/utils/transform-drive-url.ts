/**
 * Image URL helpers — Teehub CDN strategy.
 *
 * For Google Drive URLs we route through Teehub's gimage CDN:
 *   https://cdn.teehub.io/gimage/{variant}/{driveFileId}.webp
 *
 * Variants:
 *   - thumb   — 300×300 cover webp (for table thumbnails 36-48px display)
 *   - preview — 1000×1000 max webp (for preview dialog)
 *   - origin  — original bytes (for downstream work — same extension as source)
 *
 * Teehub backend handles fetching from Drive + caching on R2. The URLs are
 * deterministic — same Drive id always produces same CDN URL.
 *
 * Storage strategy: each image saves two URLs:
 *   - `url`         — Teehub preview URL (works in <img>, fast CDN)
 *   - `originalUrl` — user's Drive share URL (for download / "original" workflow)
 *
 * For non-Drive URLs (already on a CDN like cdn.onospod.com), both `url` and
 * `originalUrl` are the same.
 */

const TEEHUB_CDN_BASE = 'https://cdn.teehub.io/gimage';

export type GImageVariant = 'thumb' | 'preview' | 'origin';

/**
 * Extract Google Drive file ID from any supported URL format
 * (including Teehub CDN URLs themselves, so this is idempotent on backfill).
 */
export function extractDriveId(url?: string): string {
  if (!url || typeof url !== 'string') return '';

  const teehubMatch = url.match(/cdn\.teehub\.io\/gimage\/(?:thumb|preview|origin)\/([A-Za-z0-9_-]{10,128})/);
  if (teehubMatch) return teehubMatch[1];

  if (!url.includes('drive.google.com')) return '';

  if (url.includes('/file/d/')) {
    return url.split('/file/d/')[1]?.split('/')[0] || '';
  }
  if (url.includes('?id=')) {
    return url.split('?id=')[1]?.split('&')[0] || '';
  }
  if (url.includes('&id=')) {
    return url.split('&id=')[1]?.split('&')[0] || '';
  }
  return '';
}

/**
 * Build a Teehub CDN URL for the given Drive id + variant.
 */
export function buildTeehubUrl(id: string, variant: GImageVariant = 'preview'): string {
  const ext = variant === 'origin' ? 'jpg' : 'webp';
  return `${TEEHUB_CDN_BASE}/${variant}/${id}.${ext}`;
}

/**
 * Reconstruct the canonical Drive share URL from any input format.
 */
export function canonicalDriveUrl(url?: string): string {
  if (!url || typeof url !== 'string') return url || '';
  const id = extractDriveId(url);
  if (!id) return url;
  return `https://drive.google.com/file/d/${id}/view?usp=sharing`;
}

/**
 * Convert a Drive URL to a Teehub CDN preview URL for direct <img> use.
 * Non-Drive URLs are returned unchanged.
 *
 * @deprecated Prefer `processImageUrl` which returns both display + original.
 */
export function transformDriveUrl(url?: string): string {
  if (!url || typeof url !== 'string') return url || '';
  const id = extractDriveId(url);
  if (!id) return url;
  return buildTeehubUrl(id, 'preview');
}

/**
 * Process an image URL and return both display + original variants.
 *
 * For Drive URLs:
 *   - `url`         = Teehub CDN preview URL  (deterministic, cached on R2)
 *   - `originalUrl` = user's raw input URL    (preserved as-is when keepOriginal=true)
 *                     or canonical Drive share URL (when keepOriginal=false, e.g. backfill)
 *
 * For non-Drive URLs (cdn.onospod.com, etc.): both fields are the input.
 */
export function processImageUrl(
  input: string | undefined,
  opts: { keepOriginal?: boolean } = {},
): { url: string; originalUrl: string } {
  const safe = (input || '').trim();
  if (!safe) return { url: '', originalUrl: '' };

  const id = extractDriveId(safe);

  if (!id) return { url: safe, originalUrl: safe };

  const display = buildTeehubUrl(id, 'preview');
  const original =
    opts.keepOriginal && safe.includes('drive.google.com')
      ? safe
      : `https://drive.google.com/file/d/${id}/view?usp=sharing`;

  return { url: display, originalUrl: original };
}
