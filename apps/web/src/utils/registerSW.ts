/**
 * Register the image cache service worker.
 *
 * Only registers on HTTPS or localhost (browser requirement). Failures are
 * logged but don't throw — app continues to work without the cache.
 */
export function registerImageCacheSW(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  const isLocalhost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
  const isHttps = window.location.protocol === 'https:';
  if (!isLocalhost && !isHttps) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // eslint-disable-next-line no-console
        console.info('[sw] image cache registered, scope:', reg.scope);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[sw] registration failed:', err);
      });
  });
}

/**
 * Tell the service worker to wipe the image cache.
 * Useful from DevTools console: `clearImageCache()` after exposing.
 */
export async function clearImageCache(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.active?.postMessage({ type: 'CLEAR_IMAGE_CACHE' });
}
