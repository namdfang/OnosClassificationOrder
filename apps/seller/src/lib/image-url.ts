/**
 * Route external image URLs (order design/mockup, catalog artwork, etc.)
 * through our /api/image proxy so they're served from our R2 cache via
 * CloudFront at the correct size instead of forcing the browser to decode
 * a multi-megabyte original into a 44×44 px cell.
 *
 * Must stay pure + synchronous — this is consumed inside render paths.
 * The first few calls per unique (url, size) pair will trigger a cold
 * upload on the server; every subsequent caller gets a 302 redirect to
 * cdn.thgfulfill.com served straight from edge cache.
 *
 * THG-OMS-038: Google Drive share URL không phải image binary — convert
 * sang Drive thumbnail endpoint trước khi đi qua proxy/render. Caller
 * dùng <img src={imageThumb(url)}> sẽ tự handle Drive URL transparently.
 */

import { driveThumbnailUrl } from "@/lib/label-preview";

export type ImageThumbSize = 88 | 176 | 400 | 800;

const ALLOWED_HOSTS = new Set([
  "d2hqirjcnz1l7u.cloudfront.net",
  // Same `/designs/artworks/...` bucket served from an alternate CloudFront
  // distribution. Identified 2026-05-18 — these URLs were bypassing the
  // proxy because the hostname wasn't allowlisted, so the browser pulled
  // multi-MB originals and decoded them down to 44×44 cells. ~40 such
  // orders in dev DB; the proxy's R2 cache works on these identically.
  "dfagjn2vhwsel.cloudfront.net",
  "d1f6l48dd13912.cloudfront.net",
  "cdn.thgfulfill.com",
  "ditech.app",
]);

// Hostnames that show up in `design_url` / `mockup_url` but never serve
// image binaries — Canva design pages, the portal "create order" page
// pasted by mistake, generic websites. Listing them keeps a stray
// `<img src="…">` from issuing a 1+ MB HTML fetch that the browser then
// tosses as a "broken image". Match by suffix so subdomain typos still
// get filtered.
const NEVER_IMAGE_HOSTS = [
  "canva.com",
  "hub.thgfulfill.com",
  "thgfulfill.com",
];

/**
 * Return a proxy URL for the given external image at the requested width.
 *
 * Returns `null` (caller renders a placeholder) when:
 *   - input is null / empty / non-http
 *   - host is on the NEVER_IMAGE list (HTML page mistakenly stored)
 *   - host isn't in our allowlist (would force the browser to decode the
 *     full-resolution original — that's the lag user reported 2026-05-18)
 *
 * Trade-off: a few orders with off-allowlist artwork lose their thumbnail
 * in the list view. They still open in the lightbox via `designUrl` /
 * `mockupUrl`. Worth it — the slow path was decoding 5 MB JPEGs per row.
 */
export function imageThumb(
  url: string | null | undefined,
  size: ImageThumbSize = 88,
): string | null {
  if (!url) return null;

  // Drive share URL (vd https://drive.google.com/file/d/<ID>/view) không
  // trả image binary — convert sang thumbnail endpoint. Width param map
  // approximate Drive's sz=w<size>. Caller render <img> được trực tiếp.
  const driveThumb = driveThumbnailUrl(url, size);
  if (driveThumb) return driveThumb;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  if (NEVER_IMAGE_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
    return null;
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return null;
  }

  return `/api/image?url=${encodeURIComponent(url)}&w=${size}`;
}

/**
 * Strict check that a value is a usable HTTP(S) image URL. Used by
 * order list endpoint to drop garbage values ("df", "ff", "ddf",
 * "1") that admins occasionally paste into design_url fields. Those
 * end up rendered as `<img src="df">`, which the browser interprets
 * as a RELATIVE URL → fires `/oms/v2/df` requests → 404. Filtering
 * server-side stops those wasted round-trips and lets the page show
 * a clean placeholder div instead.
 */
export function isLikelyHttpImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.length < 8) return false; // shortest "http://x" wouldn't be a real image anyway
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    // Hostname must look like a domain (contain a dot). Catches values
    // like "http://hello" that technically parse but aren't real.
    if (!parsed.hostname.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}
