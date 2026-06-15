import React, { useEffect, useState } from 'react';
import { ExternalLink, Image as ImageIcon } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from './Spinner';
import { CopyButton } from './CopyButton';

interface ImagePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url?: string;
  originalUrl?: string;
  title?: string;
}

export function ImagePreviewDialog({ open, onOpenChange, url, originalUrl, title }: ImagePreviewDialogProps) {
  const showOriginal = originalUrl && originalUrl !== url;
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Reset loading state when URL changes
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [url]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title || 'Preview'}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center bg-muted/30 rounded-md min-h-[400px] relative">
          {url && !imgError && (
            <>
              {!imgLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner size={28} />
                </div>
              )}
              <img
                src={url}
                alt={title || 'preview'}
                className="max-w-full max-h-[70vh] object-contain rounded transition-opacity"
                style={{ opacity: imgLoaded ? 1 : 0 }}
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={() => setImgLoaded(true)}
                onError={() => {
                  setImgError(true);
                  setImgLoaded(true);
                }}
              />
            </>
          )}
          {imgError && (
            <div className="text-center py-12 text-muted-foreground text-sm px-6">
              Không tải được ảnh — có thể link đã hết hạn hoặc bị chặn CORS.
              <br />
              Thử mở link Original ở dưới.
            </div>
          )}
          {!url && (
            <div className="text-center text-muted-foreground py-12">
              <ImageIcon size={32} className="mx-auto opacity-50" />
              <p className="mt-2 text-sm">Không có ảnh</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {url && (
            <div className="flex items-start gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 mt-0.5">
                Display:
              </span>
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <CopyButton value={url} label="display URL" iconSize={11} />
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-muted-foreground hover:text-foreground font-mono truncate inline-flex items-center gap-1"
                  title={url}
                >
                  <ExternalLink size={10} className="shrink-0" />
                  <span className="truncate w-[500px] line-clamp-1">{url}</span>
                </a>
              </div>
            </div>
          )}

          {showOriginal && (
            <div className="flex items-start gap-2">
              <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider shrink-0 mt-0.5">
                Original:
              </span>
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <CopyButton value={originalUrl!} label="original URL" iconSize={11} />
                <a
                  href={originalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-foreground hover:text-primary font-mono truncate inline-flex items-center gap-1 font-semibold"
                  title={originalUrl}
                >
                  <ExternalLink size={10} className="shrink-0" />
                  <span className="truncate">{originalUrl}</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
