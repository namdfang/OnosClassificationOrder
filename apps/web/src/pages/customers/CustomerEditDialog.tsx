import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CustomerAdminRow } from 'shared';
import { CUSTOMER_TIERS } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

interface CustomerEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = tạo mới; có giá trị = sửa (SKU/email khóa read-only). */
  item: CustomerAdminRow | null;
  onSaved: () => Promise<void> | void;
}

export default function CustomerEditDialog({ open, onOpenChange, item, onSaved }: CustomerEditDialogProps) {
  const { t } = useTranslation(['customers', 'common']);
  const isEdit = !!item;
  const [userSku, setUserSku] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState<string>('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUserSku(item?.userSku ?? '');
    setUserEmail(item?.userEmail ?? '');
    setFullName(item?.fullName ?? '');
    setPhone(item?.phone ?? '');
    setTier(typeof item?.tier === 'number' ? String(item.tier) : '');
    setPassword('');
  }, [open, item]);

  const handleSubmit = async () => {
    if (!isEdit && !userSku.trim()) {
      toast.error(t('editDialog.skuRequired'));
      return;
    }
    if (!isEdit && password && password.length < 6) {
      toast.error(t('editDialog.passwordTooShort'));
      return;
    }
    const tierValue = tier === '' ? null : Number(tier);
    try {
      setSaving(true);
      if (isEdit) {
        await RepositoryRemote.customer.update(String(item._id), {
          fullName: fullName.trim(),
          phone: phone.trim(),
          tier: tierValue,
        });
        toast.success(t('toasts.editSuccess'));
      } else {
        await RepositoryRemote.customer.create({
          userSku: userSku.trim(),
          userEmail: userEmail.trim(),
          fullName: fullName.trim() || undefined,
          phone: phone.trim() || undefined,
          tier: tierValue,
          password: password || undefined,
        });
        toast.success(t('toasts.addSuccess'));
      }
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</label>
      {node}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editDialog.editTitle') : t('editDialog.createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          {field(
            t('editDialog.skuLabel'),
            <Input
              value={userSku}
              onChange={(e) => setUserSku(e.target.value)}
              placeholder={t('editDialog.skuPlaceholder')}
              disabled={isEdit}
            />,
          )}
          {field(
            t('editDialog.emailLabel'),
            <Input
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder={t('editDialog.emailPlaceholder')}
              disabled={isEdit}
            />,
          )}
          {isEdit && <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('editDialog.lockedKeyNote')}</p>}
          {field(t('editDialog.nameLabel'), <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />)}
          {field(t('editDialog.phoneLabel'), <Input value={phone} onChange={(e) => setPhone(e.target.value)} />)}
          {field(
            t('editDialog.tierLabel'),
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">{t('filters.retail')}</option>
              {CUSTOMER_TIERS.map((v) => (
                <option key={v} value={v}>
                  {t('filters.vip', { tier: v })}
                </option>
              ))}
            </select>,
          )}
          {!isEdit && (
            <>
              {field(
                t('editDialog.passwordLabel'),
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />,
              )}
              <p className="text-[11px] text-slate-400">{t('editDialog.passwordHint')}</p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Spinner size={13} className="mr-1.5" />}
            {t('actions.save', { ns: 'common' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
