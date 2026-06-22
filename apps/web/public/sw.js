/* eslint-env serviceworker */
/* global self, caches, fetch */

/**
 * Image cache service worker.
 *
 * Strategy: stale-while-revalidate
 * - First request: fetch network → store in cache → return to browser
 * - Subsequent: return from cache INSTANTLY → revalidate in background
 *
 * Only caches images from known image hosts (Google Drive thumbnails,
 * onospod CDN, etc.) — all other requests (HMR, API, etc.) pass through.
 */

const CACHE_NAME = 'image-cache-v4';

const CACHEABLE_HOSTS = [
  // Own R2 CDN — primary source after Design-R2-Pipeline migration.
  // Cả custom domain + R2.dev subdomain đều cache vì có thể swap qua lại
  // trong giai đoạn migration.
  'cdn.onosfactory.com',
  'r2.dev',
  // Teehub gimage CDN — legacy, giữ để ảnh import trước migration vẫn cache
  'cdn.teehub.io',
  // Legacy direct Drive URLs (fallback khi R2 worker chưa xử lý xong)
  'drive.google.com',
  'drive.usercontent.google.com',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'googleusercontent.com',
  // Other CDNs found in our orders data
  'cdn.onospod.com',
  'cdn.podorder.io',
  'podorder.sgp1.digitaloceanspaces.com',
];

self.addEventListener('install', () => {
  // Take over immediately instead of waiting for old SW to be released
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old cache versions (if we ever bump CACHE_NAME)
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME && n.startsWith('image-cache-')).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Only handle whitelisted hosts — everything else (Vite HMR, API, etc.) goes through normally
  if (!CACHEABLE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) return;

  event.respondWith(staleWhileRevalidate(event.request));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request, { mode: 'no-cors' })
    .then((response) => {
      // For opaque responses (no-cors), still cache them — browser can still
      // use them as <img src>
      if (response && (response.ok || response.type === 'opaque')) {
        // Clone before cache.put consumes the body
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch((err) => {
      // Network failure → fall back to cache if available
      if (cached) return cached;
      throw err;
    });

  // Return cached version IMMEDIATELY if exists, fetch in background to refresh
  return cached || networkFetch;
}

// Allow page to send a message to clear cache (for dev / debugging)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_IMAGE_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        event.source?.postMessage({ type: 'IMAGE_CACHE_CLEARED' });
      }),
    );
  }
});
