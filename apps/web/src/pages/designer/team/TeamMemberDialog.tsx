import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, KeyRound, RefreshCw } from 'lucide-react';
import type { DesignerTeamMember } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { handleAxiosError } from '@/utils';

export type DialogMode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: DialogMode;
  member: DesignerTeamMember | null;
  onClose: () => void;
  onSaved: () => void;
}

const PASSWORD_LENGTH = 12;

function randomPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  let out = '';
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function TeamMemberDialog({ open, mode, member, onClose, onSaved }: Props) {
  const { t } = useTranslation(['designerTaskWorkflow', 'common']);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hireDate, setHireDate] = useState<string>('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && member) {
      setFullName(member.fullName);
      setEmail(member.email);
      setPassword('');
      setHireDate(member.hireDate ? new Date(member.hireDate).toISOString().slice(0, 10) : '');
      setTelegramChatId(member.telegramChatId || '');
    } else {
      setFullName('');
      setEmail('');
      setPassword(randomPassword());
      setHireDate('');
      setTelegramChatId('');
    }
  }, [open, mode, member]);

  const copyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success(t('teamMemberDialog.passwordCopied'));
    } catch {
      toast.error(t('teamMemberDialog.clipboardBlocked'));
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast.error(t('teamMemberDialog.missingFields'));
      return;
    }
    if (mode === 'create' && password.length < 8) {
      toast.error(t('teamMemberDialog.passwordTooShort'));
      return;
    }
    try {
      setSaving(true);
      if (mode === 'create') {
        await RepositoryRemote.designer.createMember({
          fullName,
          email,
          password,
          hireDate: hireDate ? (new Date(hireDate) as unknown as Date) : undefined,
          telegramChatId: telegramChatId || undefined,
        });
        toast.success(t('teamMemberDialog.created', { name: fullName }));
      } else if (member) {
        await RepositoryRemote.designer.updateMember(member._id, {
          fullName,
          email,
          hireDate: hireDate ? (new Date(hireDate) as unknown as Date) : null,
          telegramChatId: telegramChatId || null,
        });
        toast.success(t('teamMemberDialog.updated'));
      }
      onSaved();
      onClose();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('teamMemberDialog.titleCreate') : t('teamMemberDialog.titleEdit')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t('teamMemberDialog.fullNameLabel')}</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('teamMemberDialog.fullNamePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('teamMemberDialog.emailLabel')}</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('teamMemberDialog.emailPlaceholder')}
              type="email"
            />
          </div>

          {mode === 'create' && (
            <div className="space-y-2">
              <Label>{t('teamMemberDialog.passwordLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="text"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPassword(randomPassword())}
                  title={t('teamMemberDialog.randomTitle')}
                >
                  <RefreshCw size={14} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyPassword}
                  title={t('teamMemberDialog.copyTitle')}
                >
                  <Copy size={14} />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <KeyRound size={11} /> {t('teamMemberDialog.passwordHint')}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('teamMemberDialog.hireDateLabel')}</Label>
              <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('teamMemberDialog.telegramLabel')}</Label>
              <Input
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder={t('teamMemberDialog.telegramPlaceholder')}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Spinner size={14} className="mr-2" />}
            {mode === 'create' ? t('teamMemberDialog.submitCreate') : t('teamMemberDialog.submitSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
