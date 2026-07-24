import React, { useRef, useState } from 'react';
import { Link2, Star, Trash2, Upload } from 'lucide-react';
import { ImageType } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

interface Props {
  /** Danh sách ảnh — index 0 là ảnh CHÍNH (lưu vào `mockup`), còn lại vào `images[]`. */
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
}

/**
 * Quản lý gallery ảnh sản phẩm: dán link HOẶC upload file (POST /v1/upload/image,
 * ImageType.Mockup — nhiều file 1 lần). Ảnh đầu tiên = Primary (hiển thị mọi
 * bảng/catalog); hover ảnh khác để "Set primary" (đưa lên đầu) hoặc xóa.
 */
export function MockupImagesEditor({ images, onChange, max = 20 }: Props) {
  const [urlDraft, setUrlDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    if (images.includes(url)) {
      toast.warning('This image URL is already in the list');
      return;
    }
    if (images.length >= max) {
      toast.error(`Maximum ${max} images`);
      return;
    }
    onChange([...images, url]);
    setUrlDraft('');
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (images.length + files.length > max) {
      toast.error(`Maximum ${max} images`);
      return;
    }
    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('type', ImageType.Mockup);
        const res = await RepositoryRemote.upload.uploadImage('', form as never);
        const url: string | undefined = res.data?.data?.url;
        if (url) uploaded.push(url);
      }
      if (uploaded.length) {
        onChange([...images, ...uploaded]);
        toast.success(`Uploaded ${uploaded.length} image${uploaded.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      handleAxiosError(error);
      if (uploaded.length) onChange([...images, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const setPrimary = (idx: number) => {
    if (idx === 0) return;
    const next = [...images];
    const [img] = next.splice(idx, 1);
    next.unshift(img);
    onChange(next);
  };

  const remove = (idx: number) => onChange(images.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {images.map((url, idx) => (
          <div key={`${url}-${idx}`} className="group relative rounded-lg border border-border overflow-hidden bg-muted">
            <a href={url} target="_blank" rel="noreferrer" title="Open full image">
              <img src={url} alt={`product ${idx + 1}`} className="w-full aspect-square object-cover" loading="lazy" />
            </a>
            {idx === 0 && (
              <Badge className="absolute top-1 left-1 px-1.5 py-0 text-[10px]">Primary</Badge>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              {idx !== 0 && (
                <button
                  type="button"
                  onClick={() => setPrimary(idx)}
                  className="p-1 rounded bg-white/90 hover:bg-white text-amber-500"
                  title="Set as primary"
                >
                  <Star size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(idx)}
                className="p-1 rounded bg-white/90 hover:bg-white text-destructive"
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {images.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            No images yet — paste a URL or upload files below.
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
            placeholder="Paste image URL and press Enter"
            className="pl-8 h-9 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={addUrl} disabled={!urlDraft.trim()}>
          Add URL
        </Button>
        <Button variant="outline" size="sm" className="h-9" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Spinner size={14} /> : <Upload size={14} />}
          Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        First image is the <span className="font-medium">primary</span> mockup (shown in product list & customer catalog). Hover an
        image to set primary or remove. Max {max} images.
      </p>
    </div>
  );
}
