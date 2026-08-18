import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Eye, EyeOff, Lock } from 'lucide-react';

import { RepositoryRemote } from '@/services';

import { CopyButton } from '@/components/common/CopyButton';
import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';

import { handleAxiosError } from '@/utils';

interface Props {
  keyConfigured: boolean;
  keyEnvName: string;
  /** Khoa dang giu trong state cua trang, `undefined` = chua bao gio lay. */
  apiKey?: string;
  onKeyLoaded: (key: string) => void;
}

/**
 * Khu vuc khoa API (AC-09, AC-10, BR-3).
 *
 * Ba rang buoc bat buoc, dung sai la fail AC:
 *  - mac dinh CHE, chi hien khi nguoi xem CHU DONG bam;
 *  - khoa chi roi may chu o dung luc do (endpoint rieng `/agent-admin/key`);
 *  - khoa khong bao gio vao URL, khong localStorage, khong ghi ra console.
 *
 * Chua cau hinh khoa thi KHONG hien o trong — hien o trong khien nguoi xem
 * tuong bo API dang bat (SRS §6).
 */
export function ApiKeyBox({ keyConfigured, keyEnvName, apiKey, onKeyLoaded }: Props) {
  const { t } = useTranslation('agentApi');
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!keyConfigured) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
          <Lock size={16} />
          {t('key.notConfiguredTitle')}
        </p>
        <p className="text-sm text-amber-700 dark:text-amber-200/80">{t('key.notConfiguredHint', { env: keyEnvName })}</p>
        <CopyButton value={keyEnvName} label={keyEnvName} />
      </div>
    );
  }

  const handleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    if (apiKey !== undefined) {
      setRevealed(true);
      return;
    }
    try {
      setLoading(true);
      const res = await RepositoryRemote.agentApi.revealKey();
      const value = (res.data?.data?.key || '') as string;
      onKeyLoaded(value);
      setRevealed(true);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('key.title')}</span>
        <Button variant="outline" size="sm" onClick={handleReveal} disabled={loading}>
          {loading ? <Spinner size={14} /> : revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          <span className="ml-1.5">{revealed ? t('key.hide') : t('key.reveal')}</span>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded-lg bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
          {revealed && apiKey !== undefined ? apiKey : '••••••••••••••••••••••••••••••••'}
        </code>
        {revealed && apiKey ? <CopyButton value={apiKey} label={t('key.title')} /> : null}
      </div>

      <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        {t('key.warning')}
      </p>
    </div>
  );
}
