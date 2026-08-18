import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, UploadCloud, XCircle } from 'lucide-react';
import { designCdnUrl } from 'shared';

import { RepositoryRemote } from '@/services';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

import { Hint } from './Hint';

interface FileUrlOrUploadInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'hashing' }
  | { phase: 'uploading'; percent: number }
  | { phase: 'processing' }
  | { phase: 'done'; instant: boolean }
  | { phase: 'error'; message: string };

/** sha256 hex của file bằng WebCrypto — tính TRƯỚC upload để dedup (file trùng = 0 giây). */
async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** PUT lên R2 bằng XHR để có progress event (fetch chưa hỗ trợ upload progress). */
function putWithProgress(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(file);
  });
}

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_TRIES = 60; // ~2.5 phút — file lớn resize lâu vẫn kịp

/**
 * Input cho field kiểu "file" (mockup/design) ở Customer Portal — dán URL
 * (Drive…) HOẶC upload trực tiếp lên R2 qua presigned URL (file KHÔNG đi qua
 * API server). Luồng: sha256 client → presign (dedup hit = xong ngay) → PUT →
 * confirm → poll tới khi worker xử lý xong. Value cuối = CDN original URL.
 * Xem `documents/Plans/DesignStorage-R2-ProcessingWorker.md`.
 */
export function FileUrlOrUploadInput({ value, onChange, placeholder, className }: FileUrlOrUploadInputProps) {
  const { t } = useTranslation('customerPortal');
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: 'idle' });

  const busy = state.phase === 'hashing' || state.phase === 'uploading' || state.phase === 'processing';

  const handleFile = async (file: File) => {
    try {
      setState({ phase: 'hashing' });
      const sha256 = await sha256OfFile(file);

      const presignRes = await RepositoryRemote.customerDesign.presignDesignUpload({
        sha256,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        fileName: file.name,
      });
      const presign = presignRes?.data?.data;
      const publicBase: string = presign?.publicBase ?? '';

      if (presign?.mode === 'exists') {
        // Dedup hit — file đã có trên CDN, "upload" 0 giây.
        onChange(designCdnUrl(publicBase, sha256, 'original'));
        setState({ phase: 'done', instant: true });
        return;
      }

      setState({ phase: 'uploading', percent: 0 });
      await putWithProgress(presign.uploadUrl, file, (percent) => setState({ phase: 'uploading', percent }));

      await RepositoryRemote.customerDesign.confirmDesignUpload({ tmpKey: presign.tmpKey, sha256, fileName: file.name });
      // Value chốt NGAY (URL theo sha không đổi) — poll chỉ để báo trạng thái xử lý.
      onChange(designCdnUrl(publicBase, sha256, 'original'));

      setState({ phase: 'processing' });
      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const res = await RepositoryRemote.customerDesign.getDesignFile(sha256);
        const status = res?.data?.data?.status;
        if (status === 'ready') {
          setState({ phase: 'done', instant: false });
          return;
        }
        if (status === 'failed') {
          setState({ phase: 'error', message: res?.data?.data?.errorMessage || t('fileInput.processFailed') });
          return;
        }
      }
      // Quá thời gian poll — file vẫn đang xử lý nền, value đã set nên không chặn khách.
      setState({ phase: 'done', instant: false });
    } catch (error) {
      handleAxiosError(error);
      setState({ phase: 'error', message: t('fileInput.uploadFailed') });
    }
  };

  return (
    <div className={className}>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 flex-1"
          disabled={busy}
        />
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
        <Hint content={t('fileInput.uploadHint')}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            ) : (
              <UploadCloud size={16} className="text-muted-foreground" />
            )}
          </Button>
        </Hint>
      </div>
      {state.phase === 'hashing' && <p className="mt-1 text-xs text-muted-foreground">{t('fileInput.hashing')}</p>}
      {state.phase === 'uploading' && (
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
            <div className="h-full rounded bg-primary transition-all" style={{ width: `${state.percent}%` }} />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{state.percent}%</span>
        </div>
      )}
      {state.phase === 'processing' && (
        <p className="mt-1 text-xs text-muted-foreground">{t('fileInput.processing')}</p>
      )}
      {state.phase === 'done' && (
        <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 size={12} />
          {state.instant ? t('fileInput.doneInstant') : t('fileInput.done')}
        </p>
      )}
      {state.phase === 'error' && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
          <XCircle size={12} />
          {state.message}
        </p>
      )}
    </div>
  );
}
