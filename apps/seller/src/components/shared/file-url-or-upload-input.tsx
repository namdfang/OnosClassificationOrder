'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Loader2, UploadCloud, XCircle } from 'lucide-react';
import type { DesignFile, DesignUploadConfig } from 'shared';
import { designCdnUrl } from 'shared/client';
import { apiFetch } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';

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
  | { phase: 'unconfirmed' }
  | { phase: 'error'; message: string };

/** Cache cấu hình tải lên ở module — 1 form nhiều ô, chỉ gọi 1 lần. Lỗi thì xoá để lần sau thử lại. */
let uploadConfigPromise: Promise<DesignUploadConfig> | null = null;
function loadUploadConfig(): Promise<DesignUploadConfig> {
  if (!uploadConfigPromise) {
    uploadConfigPromise = apiFetch<ApiRes<DesignUploadConfig>>('/api/v1/customer/designs/upload-config')
      .then((res) => {
        if (!res.data?.maxUploadMb) throw new Error('upload config missing');
        return res.data;
      })
      .catch((e) => {
        uploadConfigPromise = null;
        throw e;
      });
  }
  return uploadConfigPromise;
}

function isAllowedFile(file: File, cfg: DesignUploadConfig): boolean {
  const mime = (file.type || '').toLowerCase();
  const extOk = cfg.allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
  if (!mime || mime === 'application/octet-stream') return extOk;
  return cfg.allowedMimeTypes.includes(mime);
}

async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** PUT thẳng lên R2 (presigned URL) bằng XHR để có progress. KHÔNG đi qua proxy Next. */
function putWithProgress(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(file);
  });
}

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_TRIES = 60;

interface PresignRes {
  mode: 'exists' | 'upload';
  file: DesignFile;
  publicBase: string;
  uploadUrl?: string;
  tmpKey?: string;
}

/**
 * Mirror `apps/web/src/components/common/FileUrlOrUploadInput.tsx` (DesignStorage.md): dán URL
 * HOẶC upload trực tiếp browser→R2: kiểm định dạng/kích thước → sha256 → presign (dedup) → PUT →
 * confirm → poll. Value cuối = CDN original URL. R2 bucket PHẢI có CORS cho origin seller.
 */
export function FileUrlOrUploadInput({ value, onChange, placeholder, className }: FileUrlOrUploadInputProps) {
  const { t } = useTranslation('customerPortal');
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const [config, setConfig] = useState<DesignUploadConfig | null>(null);

  useEffect(() => {
    let alive = true;
    loadUploadConfig().then(
      (cfg) => {
        if (alive) setConfig(cfg);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  const busy = state.phase === 'hashing' || state.phase === 'uploading' || state.phase === 'processing';
  const accept = config ? [...config.allowedMimeTypes, ...config.allowedExtensions].join(',') : undefined;

  const handleFile = async (file: File) => {
    let cfg: DesignUploadConfig;
    try {
      cfg = await loadUploadConfig();
      setConfig(cfg);
    } catch {
      setState({ phase: 'error', message: t('fileInput.configFailed') });
      return;
    }
    if (!cfg.uploadEnabled) {
      setState({ phase: 'error', message: t('fileInput.uploadUnavailable') });
      return;
    }
    if (!isAllowedFile(file, cfg)) {
      setState({ phase: 'error', message: t('fileInput.badType', { formats: cfg.allowedExtensions.join(', ') }) });
      return;
    }
    if (file.size > cfg.maxUploadMb * 1024 * 1024) {
      setState({ phase: 'error', message: t('fileInput.tooLarge', { size: (file.size / 1024 / 1024).toFixed(1), max: cfg.maxUploadMb }) });
      return;
    }
    try {
      setState({ phase: 'hashing' });
      const sha256 = await sha256OfFile(file);
      const presign = (
        await apiFetch<ApiRes<PresignRes>>('/api/v1/customer/designs/presign', {
          method: 'POST',
          body: JSON.stringify({ sha256, size: file.size, mime: file.type || 'application/octet-stream', fileName: file.name }),
        })
      ).data;
      const publicBase = presign.publicBase ?? '';
      if (presign.mode === 'exists') {
        onChange(designCdnUrl(publicBase, sha256, 'original'));
        setState({ phase: 'done', instant: true });
        return;
      }
      if (!presign.uploadUrl || !presign.tmpKey) throw new Error('presign missing uploadUrl');
      setState({ phase: 'uploading', percent: 0 });
      await putWithProgress(presign.uploadUrl, file, (percent) => setState({ phase: 'uploading', percent }));
      await apiFetch('/api/v1/customer/designs/confirm', {
        method: 'POST',
        body: JSON.stringify({ tmpKey: presign.tmpKey, sha256, fileName: file.name }),
      });
      onChange(designCdnUrl(publicBase, sha256, 'original'));
      setState({ phase: 'processing' });
      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const res = await apiFetch<ApiRes<DesignFile>>(`/api/v1/customer/designs/${sha256}`);
        if (res.data?.status === 'ready') {
          setState({ phase: 'done', instant: false });
          return;
        }
        if (res.data?.status === 'failed') {
          setState({ phase: 'error', message: res.data.errorMessage || t('fileInput.processFailed') });
          return;
        }
      }
      setState({ phase: 'unconfirmed' });
    } catch {
      setState({ phase: 'error', message: t('fileInput.uploadFailed') });
    }
  };

  return (
    <div className={className}>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={busy}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border1 bg-card text-xs text-text-primary outline-none focus:border-accent placeholder:text-text-placeholder disabled:opacity-60"
        />
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          title={t('fileInput.uploadHint', { max: config?.maxUploadMb ?? '…' })}
          className="w-9 h-9 shrink-0 rounded-lg border border-border1 bg-card flex items-center justify-center text-text-muted hover:text-accent hover:border-accent disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
        </button>
      </div>
      {state.phase === 'hashing' && <p className="mt-1 text-[11px] text-text-muted">{t('fileInput.hashing')}</p>}
      {state.phase === 'uploading' && (
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-surface-muted">
            <div className="h-full rounded bg-accent transition-all" style={{ width: `${state.percent}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-text-muted">{state.percent}%</span>
        </div>
      )}
      {state.phase === 'processing' && <p className="mt-1 text-[11px] text-text-muted">{t('fileInput.processing')}</p>}
      {state.phase === 'done' && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-success">
          <CheckCircle2 size={11} />
          {state.instant ? t('fileInput.doneInstant') : t('fileInput.done')}
        </p>
      )}
      {state.phase === 'unconfirmed' && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-warning">
          <Clock size={11} className="mt-0.5 shrink-0" />
          {t('fileInput.unconfirmed')}
        </p>
      )}
      {state.phase === 'error' && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-error">
          <XCircle size={11} className="mt-0.5 shrink-0" />
          {state.message}
        </p>
      )}
    </div>
  );
}
