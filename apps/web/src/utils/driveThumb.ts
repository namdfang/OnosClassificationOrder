/**
 * Convert a Teehub CDN preview URL to the smaller thumb variant.
 *
 *   https://cdn.teehub.io/gimage/preview/{id}.webp
 *     ↓
 *   https://cdn.teehub.io/gimage/thumb/{id}.webp
 *
 * The thumb variant is 300×300 webp Q=70 (~10KB), perfect for 36-48px display.
 * The preview variant is 1000×1000 webp Q=82 (~80KB), used in preview dialog.
 *
 * For non-Teehub URLs (CDN, S3, etc.) returns the input unchanged.
 *
 * The legacy `size` param is kept for backwards compatibility with old Google
 * Drive thumbnail URLs that might still be in DB before backfill.
 */
export function smallThumb(url?: string, _legacySize = 200): string {
  if (!url || typeof url !== 'string') return url || '';

  // New Teehub CDN: swap preview → thumb
  if (url.includes('cdn.teehub.io/gimage/preview/')) {
    return url.replace('/gimage/preview/', '/gimage/thumb/');
  }

  // Legacy Google Drive thumbnail URL — keep size adjustment for backwards compat
  if (url.includes('drive.google.com/thumbnail')) {
    return url.replace(/sz=w\d+/, `sz=w${_legacySize}`);
  }

  return url;
}
