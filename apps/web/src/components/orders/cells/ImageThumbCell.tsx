import React from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface Props {
  url?: string;
  originalUrl?: string;
  title?: string;
  onOpen?: (url: string, title: string, originalUrl?: string) => void;
  size?: number;
}

function smallThumb(url?: string): string | undefined {
  return url?.replace('/gimage/s800/', '/gimage/s200/');
}

export function ImageThumbCell({ url, originalUrl, title, onOpen, size = 36 }: Props) {
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
      className="inline-block rounded border border-border overflow-hidden hover:ring-2 hover:ring-primary/40"
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
    </button>
  );
}
