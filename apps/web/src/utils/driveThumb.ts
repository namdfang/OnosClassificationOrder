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

// Mirror `apps/api/src/utils/design-url.ts` — tách Drive fileId từ URL.
const DRIVE_FILE_PATTERN = /\/file\/d\/([A-Za-z0-9_-]{10,128})/;
const DRIVE_ID_QUERY_PATTERN = /[?&]id=([A-Za-z0-9_-]{10,128})/;

export function extractDriveId(url?: string): string | null {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('drive.google.com') && !url.includes('drive.usercontent.google.com')) {
    return null;
  }
  const m = url.match(DRIVE_FILE_PATTERN) ?? url.match(DRIVE_ID_QUERY_PATTERN);
  return m ? m[1] : null;
}

/**
 * URL ảnh NHẸ để render thumbnail — KHÔNG tải nguyên file gốc (design mấy chục
 * MB). Ưu tiên:
 *   - Drive → endpoint thumbnail của Google (`?sz=w{width}`) ~vài chục KB, do
 *     Google CDN phục vụ, KHÔNG qua server mình.
 *   - R2 preview → biến thể `thumb`.
 *   - Còn lại → giữ nguyên.
 */
export function driveThumbUrl(url?: string, width = 400): string {
  if (!url || typeof url !== 'string') return url || '';
  const id = extractDriveId(url);
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
  if (url.includes('/designs/preview/')) return url.replace('/designs/preview/', '/designs/thumb/');
  return url;
}

/**
 * URL mở ở tab mới khi click ảnh — Drive → trang viewer của Google (render +
 * cho zoom/tải tuỳ user, KHÔNG tải full qua server mình). Non-Drive → URL gốc.
 */
export function driveViewUrl(url?: string): string {
  if (!url) return '';
  const id = extractDriveId(url);
  return id ? `https://drive.google.com/file/d/${id}/view` : url;
}

/**
 * URL tải file trực tiếp — Drive → endpoint download của Google (trả file kèm
 * Content-Disposition attachment cho file "Anyone with link"). KHÔNG qua server
 * mình. File > 100MB Drive có thể chèn trang confirm virus-scan. Non-Drive → gốc.
 */
export function driveDownloadUrl(url?: string): string {
  if (!url) return '';
  const id = extractDriveId(url);
  return id ? `https://drive.usercontent.google.com/download?id=${id}&export=download` : url;
}
