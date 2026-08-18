import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Wand2 } from 'lucide-react';
import type { CustomerAdminRow } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { CopyButton } from '@/components/common/CopyButton';
import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CustomerAdminRow | null;
}

/** Reset mật khẩu khách — Admin nhập tay HOẶC generate random (plain hiển thị đúng 1 lần). */
export default function ResetPasswordDialog({ open, onOpenChange, item }: ResetPasswordDialogProps) {
  const { t } = useTranslation(['customers', 'common']);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState('');

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setConfirm('');
    setGenerated('');
  }, [open]);

  const submit = async (mode: 'manual' | 'generate') => {
    if (!item) return;
    if (mode === 'manual') {
      if (password.length < 6) {
        toast.error(t('resetDialog.tooShort'));
        return;
      }
      if (password !== confirm) {
        toast.error(t('resetDialog.mismatch'));
        return;
      }
    }
    try {
      setSaving(true);
      const res = await RepositoryRemote.customer.resetPassword(
        String(item._id),
        mode === 'manual' ? password : undefined,
      );
      const gen = res.data?.data?.generatedPassword as string | undefined;
      toast.success(t('resetDialog.success', { sku: item.userSku }));
      if (gen) setGenerated(gen);
      else onOpenChange(false);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound size={16} className="text-indigo-500" />
            {t('resetDialog.title', { sku: item?.userSku ?? '' })}
          </DialogTitle>
        </DialogHeader>

        {generated ? (
          <div className="space-y-3 pt-1">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{t('resetDialog.generatedTitle')}</p>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5">
              <code className="flex-1 font-mono text-sm text-emerald-700 dark:text-emerald-300 select-all">
                {generated}
              </code>
              <CopyButton value={generated} />
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('resetDialog.generatedWarning')}</p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t('actions.close', { ns: 'common' })}</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t('resetDialog.manualLabel')}
              </label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t('resetDialog.confirmLabel')}
              </label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => submit('manual')} disabled={saving || !password}>
              {saving && <Spinner size={13} className="mr-1.5" />}
              {t('resetDialog.submit')}
            </Button>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <div className="h-px flex-1 bg-border" />
              {t('resetDialog.orDivider')}
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" onClick={() => submit('generate')} disabled={saving}>
              <Wand2 size={14} />
              {t('resetDialog.generate')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
