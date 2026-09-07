'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Save, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/shared/button';
import { PageHeader } from '@/components/shared/page-header';
import { useToast } from '@/components/shared/toast';
import { useSession } from '@/context/session-context';
import { apiFetch } from '@/hooks/use-api';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-border1 bg-card text-xs text-text-primary outline-none focus:border-accent disabled:opacity-60 disabled:bg-surface-muted';

/** Mirror `apps/web/src/pages/customer/account/index.tsx`: sửa hồ sơ (`PATCH customer/auth/me`) + đổi mật khẩu. */
export default function AccountPage() {
  const { t } = useTranslation(['customerPortal', 'common']);
  const { toast } = useToast();
  const { profile, refresh } = useSession();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [seenProfile, setSeenProfile] = useState<typeof profile>(null);
  if (profile && profile !== seenProfile) {
    setSeenProfile(profile);
    setFullName(profile.fullName ?? '');
    setPhone(profile.phone ?? '');
  }
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await apiFetch('/api/v1/customer/auth/me', { method: 'PATCH', body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim() }) });
      refresh();
      toast('success', t('customerPortal:account.profileSaved'));
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 6) return toast('error', t('customerPortal:account.passwordTooShort'));
    if (newPassword !== confirmPassword) return toast('error', t('customerPortal:account.passwordMismatch'));
    setSavingPassword(true);
    try {
      await apiFetch('/api/v1/customer/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      toast('success', t('customerPortal:account.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSavingPassword(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-text-muted uppercase">{label}</label>
      {node}
    </div>
  );

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <PageHeader title={t('customerPortal:account.title')} />
      <section className="rounded-xl border border-border1 bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
          <UserCircle2 size={15} className="text-accent" />
          {t('customerPortal:account.profileSection')}
        </h2>
        {field(t('customerPortal:account.emailLabel'), <input value={profile?.userEmail ?? ''} disabled className={inputCls} />)}
        {field(t('customerPortal:account.skuLabel'), <input value={profile?.userSku ?? ''} disabled className={inputCls} />)}
        <p className="text-[11px] text-text-muted">{t('customerPortal:account.lockedKeyNote')}</p>
        {field(t('customerPortal:account.nameLabel'), <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />)}
        {field(t('customerPortal:account.phoneLabel'), <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />)}
        <Button variant="primary" className="w-full" loading={savingProfile} onClick={saveProfile}>
          <Save size={13} className="mr-1.5" />
          {t('common:actions.save')}
        </Button>
      </section>
      <section className="rounded-xl border border-border1 bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
          <KeyRound size={14} className="text-accent" />
          {t('customerPortal:account.passwordSection')}
        </h2>
        {field(t('customerPortal:account.currentPasswordLabel'), <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} autoComplete="current-password" />)}
        {field(t('customerPortal:account.newPasswordLabel'), <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} autoComplete="new-password" />)}
        {field(t('customerPortal:account.confirmPasswordLabel'), <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} autoComplete="new-password" />)}
        <Button variant="outline" className="w-full" loading={savingPassword} disabled={!currentPassword || !newPassword} onClick={changePassword}>
          {t('customerPortal:account.changePasswordButton')}
        </Button>
      </section>
    </div>
  );
}
