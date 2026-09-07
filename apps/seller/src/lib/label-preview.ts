// Mirror `apps/web/src/utils/driveThumb.ts` (không import `shared` gốc để khỏi kéo NestJS).
const DRIVE_FILE_PATTERN = /\/file\/d\/([A-Za-z0-9_-]{10,128})/;
const DRIVE_ID_QUERY_PATTERN = /[?&]id=([A-Za-z0-9_-]{10,128})/;

export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('drive.google.com') && !url.includes('drive.usercontent.google.com')) return null;
  const m = url.match(DRIVE_FILE_PATTERN) ?? url.match(DRIVE_ID_QUERY_PATTERN);
  return m ? m[1] : null;
}

/** URL thumbnail nhẹ: Drive → endpoint thumbnail Google; R2 preview → biến thể thumb. */
export function driveThumbnailUrl(url: string | null | undefined, width = 400): string | null {
  const id = extractDriveFileId(url);
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
  if (url && url.includes('/designs/preview/') && width <= 200) return url.replace('/designs/preview/', '/designs/thumb/');
  return null;
}

export function driveViewUrl(url?: string): string {
  if (!url) return '';
  const id = extractDriveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/view` : url;
}
