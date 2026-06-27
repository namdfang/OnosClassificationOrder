import { Injectable } from '@nestjs/common';

/**
 * Lấy tên file hiển thị của 1 Google Drive file qua public preview page.
 * KHÔNG cần auth — chỉ hoạt động với file shared "Anyone with link".
 *
 * Cách lấy: fetch `https://drive.google.com/file/d/{id}/view` rồi parse
 * `<title>{name} - Google Drive</title>` trong HTML. Có 2 fallback nữa
 * (`<meta property="og:title">` và filename trong JSON state) để chắc ăn.
 *
 * Retry x2 với backoff 500ms cho mọi lỗi (network / parse / 404). Mỗi link
 * tổng worst-case = 3 attempt × ~2s timeout = ~6s. Service cap concurrency
 * tới 5 ở caller (xem `OrderService.previewCuttingFiles`) để tránh Drive
 * rate-limit khi list 1000 link.
 */
@Injectable()
export class DriveFileNameService {
  private readonly TIMEOUT_MS = 8000;
  private readonly MAX_RETRIES = 2;
  private readonly BACKOFF_MS = 500;

  /**
   * Trả về { fileId, fileName } hoặc null nếu mọi attempt fail / không parse
   * được tên. URL không hợp lệ → trả null (caller phân biệt với fetch-failed).
   */
  async fetchFileName(
    url: string,
  ): Promise<{ fileId: string; fileName: string } | { fileId: string; error: 'fetch-failed' | 'parse-failed' } | null> {
    const fileId = this.extractFileId(url);
    if (!fileId) return null;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const fileName = await this.fetchOnce(fileId);
        if (fileName) return { fileId, fileName };
        if (attempt === this.MAX_RETRIES) return { fileId, error: 'parse-failed' };
      } catch {
        if (attempt === this.MAX_RETRIES) return { fileId, error: 'fetch-failed' };
      }
      await new Promise((r) => setTimeout(r, this.BACKOFF_MS));
    }
    return { fileId, error: 'fetch-failed' };
  }

  /**
   * Extract Drive fileId từ các format URL phổ biến:
   *   - `/file/d/{id}/view`
   *   - `/file/d/{id}` (không có view)
   *   - `?id={id}` (Drive cũ)
   *   - `/open?id={id}`
   *   - `/uc?id={id}` (download direct)
   */
  extractFileId(url: string): string | null {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    // Pattern 1: /file/d/{id}
    const m1 = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m1) return m1[1];

    // Pattern 2: ?id={id} or &id={id}
    const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m2) return m2[1];

    // Pattern 3: Pure ID đã copy ra
    if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;

    return null;
  }

  private async fetchOnce(fileId: string): Promise<string | null> {
    const url = `https://drive.google.com/file/d/${fileId}/view`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), this.TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          // Drive trả khác nếu request từ bot — giả browser cho ổn định.
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      return this.parseFileName(html);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Drive preview page có nhiều chỗ chứa tên file. Thử theo độ tin cậy
   * (og:title cứng nhất → title tag → JSON ITEM_METADATA).
   */
  private parseFileName(html: string): string | null {
    // 1. og:title — Drive luôn set field này = filename (no suffix)
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (og && og[1]) return this.decodeHtml(og[1]);

    // 2. <title>{name} - Google Drive</title>
    const title = html.match(/<title>([^<]+?)\s*-\s*Google Drive<\/title>/i);
    if (title && title[1]) return this.decodeHtml(title[1].trim());

    // 3. ITEM_METADATA JSON inline — fallback cho 1 vài file đặc biệt
    const meta = html.match(/"title":"([^"]+\.(?:pdf|png|jpg|jpeg|ai|psd|zip|rar))"/i);
    if (meta && meta[1]) return this.decodeHtml(meta[1]);

    return null;
  }

  private decodeHtml(s: string): string {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  }
}
