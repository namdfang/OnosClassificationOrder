import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Star, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** 1 ảnh trong gallery — HOẶC url đã lưu/dán link, HOẶC file chờ upload (chỉ upload khi bấm Lưu). */
export interface GalleryImage {
  url?: string;
  file?: File;
  /** Object URL preview cho `file` — tạo lúc chọn file, revoke khi xóa. */
  preview?: string;
}

/** URL hiển thị của 1 entry (ảnh đã lưu hoặc preview local). */
export const galleryImageSrc = (img: GalleryImage): string => img.url || img.preview || '';

interface Props {
  /** Danh sách ảnh — index 0 là ảnh CHÍNH (lưu vào `mockup`), còn lại vào `images[]`. */
  images: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
  max?: number;
}

/**
 * Gallery ảnh sản phẩm: dán link HOẶC chọn nhiều file — file CHỈ preview local
 * (`URL.createObjectURL`), upload thật sự xảy ra ở `handleSave` trang cha qua
 * `POST /v1/product-configs/upload-image` (local disk, cùng pattern deferred
 * với ảnh bảng size). Ảnh đầu = Primary (hiển thị mọi bảng/catalog); hover để
 * "Set primary" (đưa lên đầu) hoặc xóa.
 */
export function MockupImagesEditor({ images, onChange, max = 20 }: Props) {
  const { t } = useTranslation('products');
  const [urlDraft, setUrlDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const addUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    if (images.some((img) => img.url === url)) {
      toast.warning(t('detail.gallery.duplicateUrl'));
      return;
    }
    if (images.length >= max) {
      toast.error(t('detail.gallery.maxReached', { max }));
      return;
    }
    onChange([...images, { url }]);
    setUrlDraft('');
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    if (images.length + files.length > max) {
      toast.error(t('detail.gallery.maxReached', { max }));
      return;
    }
    const entries: GalleryImage[] = Array.from(files).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    onChange([...images, ...entries]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const setPrimary = (idx: number) => {
    if (idx === 0) return;
    const next = [...images];
    const [img] = next.splice(idx, 1);
    next.unshift(img);
    onChange(next);
  };

  const remove = (idx: number) => {
    const target = images[idx];
    if (target?.preview) URL.revokeObjectURL(target.preview);
    onChange(images.filter((_, i) => i !== idx));
  };

  const pendingCount = images.filter((img) => img.file).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {images.map((img, idx) => (
          <div key={`${galleryImageSrc(img)}-${idx}`} className="group relative rounded-lg border border-border overflow-hidden bg-muted">
            <img src={galleryImageSrc(img)} alt={`product ${idx + 1}`} className="w-full aspect-square object-cover" loading="lazy" />
            {idx === 0 && <Badge className="absolute top-1 left-1 px-1.5 py-0 text-[10px]">{t('detail.gallery.primary')}</Badge>}
            {img.file && (
              <Badge className="absolute bottom-1 left-1 px-1.5 py-0 text-[10px] bg-amber-500 border-amber-500 text-white">
                {t('detail.gallery.pending')}
              </Badge>
            )}
            <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-1 p-1 bg-gradient-to-b from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              {idx !== 0 && (
                <button
                  type="button"
                  onClick={() => setPrimary(idx)}
                  className="p-1 rounded bg-white/90 hover:bg-white text-amber-500"
                  title={t('detail.gallery.setPrimary')}
                >
                  <Star size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(idx)}
                className="p-1 rounded bg-white/90 hover:bg-white text-destructive"
                title={t('detail.gallery.remove')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {images.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            {t('detail.gallery.empty')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Link2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addUrl();
              }
            }}
            placeholder={t('detail.gallery.urlPlaceholder')}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={addUrl} disabled={!urlDraft.trim()}>
          {t('detail.gallery.addUrl')}
        </Button>
        <Button variant="outline" size="sm" className="h-9" onClick={() => fileRef.current?.click()}>
          <Upload size={14} />
          {t('detail.gallery.upload')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{t('detail.gallery.hint', { max })}</p>
      {pendingCount > 0 && <p className="text-[11px] text-amber-600">{t('detail.gallery.pendingHint', { count: pendingCount })}</p>}
    </div>
  );
}
