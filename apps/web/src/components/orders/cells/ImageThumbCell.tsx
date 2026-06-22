import React from 'react';
import { AlertTriangle, ExternalLink, Image as ImageIcon, Loader2 } from 'lucide-react';

interface Props {
  url?: string;
  originalUrl?: string;
  title?: string;
  onOpen?: (url: string, title: string, originalUrl?: string) => void;
  size?: number;
  /** Trạng thái pipeline R2: 'pending' = đang xử lý, 'failed' = sai (show fallback link gốc). */
  status?: 'pending' | 'ready' | 'failed';
}

/**
 * Map URL preview → URL thumb. Hỗ trợ cả 2 schema:
 *   - Own R2: `/designs/preview/{hash}.webp` → `/designs/thumb/{hash}.webp`
 *   - Legacy Teehub: `/gimage/preview/{id}.webp` → `/gimage/thumb/{id}.webp`
 *                    (cũng support `s800` → `s200` cũ hơn)
 */
function smallThumb(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.includes('/designs/preview/')) return url.replace('/designs/preview/', '/designs/thumb/');
  if (url.includes('/gimage/preview/')) return url.replace('/gimage/preview/', '/gimage/thumb/');
  return url.replace('/gimage/s800/', '/gimage/s200/');
}

export function ImageThumbCell({ url, originalUrl, title, onOpen, size = 36, status }: Props) {
  // Pending — pipeline R2 đang chạy. Show skeleton + spinner.
  if (status === 'pending' && !url) {
    return (
      <span
        className="inline-flex items-center justify-center rounded border border-dashed border-amber-300 bg-amber-50/40 text-amber-600 dark:bg-amber-500/5"
        style={{ width: size, height: size }}
        title="Đang xử lý ảnh trên R2…"
      >
        <Loader2 size={14} className="animate-spin" />
      </span>
    );
  }

  // Failed — worker fail. Show alert + link gốc nếu có.
  if (status === 'failed') {
    if (originalUrl) {
      return (
        <a
          href={originalUrl}
          target="_blank"
          rel="noreferrer"
          title="Ảnh xử lý thất bại — click mở link gốc"
          className="inline-flex items-center justify-center rounded border border-rose-300 bg-rose-50/40 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/5"
          style={{ width: size, height: size }}
        >
          <AlertTriangle size={14} />
        </a>
      );
    }
    return (
      <span
        className="inline-flex items-center justify-center rounded border border-rose-300 bg-rose-50/40 text-rose-600 dark:bg-rose-500/5"
        style={{ width: size, height: size }}
        title="Ảnh xử lý thất bại"
      >
        <AlertTriangle size={14} />
      </span>
    );
  }

  if (!url) {
    return (
      <span
        className="inline-flex items-center justify-center rounded border border-border bg-muted text-muted-foreground"
        style={{ width: size, height: size }}
      >
        <ImageIcon size={14} />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen?.(url, title || 'Ảnh', originalUrl)}
      title={title}
      className="inline-block rounded border border-border overflow-hidden hover:ring-2 hover:ring-primary/40 relative group"
      style={{ width: size, height: size }}
    >
      <img
        src={smallThumb(url)}
        alt={title || ''}
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
      {originalUrl && originalUrl !== url && (
        <span className="absolute bottom-0 right-0 bg-background/70 rounded-tl text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink size={9} className="m-0.5" />
        </span>
      )}
    </button>
  );
}
