// Đồng bộ 3 namespace dùng chung từ apps/web → apps/seller (I18n.md: sửa khóa ở apps/web trước).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../web/src/i18n/locales');
const dst = resolve(here, '../src/i18n/locales');
const SHARED = ['customerPortal', 'track', 'common'];
for (const lang of ['vi', 'en']) {
  mkdirSync(resolve(dst, lang), { recursive: true });
  for (const ns of SHARED) copyFileSync(resolve(src, lang, `${ns}.json`), resolve(dst, lang, `${ns}.json`));
}
console.log(`[sync-i18n] copied ${SHARED.join(', ')} (vi, en)`);
