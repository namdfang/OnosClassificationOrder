/**
 * Convert a self-hosted R2 preview URL to the smaller thumb variant.
 *
 *   https://cdn.<...>/designs/preview/{hash}.webp
 *     ↓
 *   https://cdn.<...>/designs/thumb/{hash}.webp
 *
 * For URLs that don't match the R2 pattern, returns the input unchanged.
 * The `_legacySize` parameter is kept for callsite compatibility — unused.
 */
export function smallThumb(url?: string, _legacySize = 200): string {
  if (!url || typeof url !== 'string') return url || '';
  if (url.includes('/designs/preview/')) return url.replace('/designs/preview/', '/designs/thumb/');
  return url;
}
