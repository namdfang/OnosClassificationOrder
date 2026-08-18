import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Save, UserCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { useCustomerAuthStore } from '@/store/customerAuthStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

/** Trang "Tài khoản của tôi" — khách tự sửa hồ sơ + đổi mật khẩu (Customer Portal). */
export default function CustomerAccountPage() {
  const { t } = useTranslation(['customerPortal', 'common']);
  const { profile, setProfile } = useCustomerAuthStore();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setFullName(profile?.fullName ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile]);

  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true);
      const res = await RepositoryRemote.customerAuth.updateMe({ fullName: fullName.trim(), phone: phone.trim() });
      if (res.data?.data) setProfile(res.data.data);
      toast.success(t('account.profileSaved'));
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error(t('account.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('account.passwordMismatch'));
      return;
    }
    try {
      setSavingPassword(true);
      await RepositoryRemote.customerAuth.changePassword({ currentPassword, newPassword });
      toast.success(t('account.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSavingPassword(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {node}
    </div>
  );

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <UserCircle2 size={20} className="text-indigo-500" />
        <h1 className="text-lg font-semibold">{t('account.title')}</h1>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">{t('account.profileSection')}</h2>
        {field(t('account.emailLabel'), <Input value={profile?.userEmail ?? ''} disabled />)}
        {field(t('account.skuLabel'), <Input value={profile?.userSku ?? ''} disabled />)}
        <p className="text-[11px] text-muted-foreground">{t('account.lockedKeyNote')}</p>
        {field(t('account.nameLabel'), <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />)}
        {field(t('account.phoneLabel'), <Input value={phone} onChange={(e) => setPhone(e.target.value)} />)}
        <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full">
          {savingProfile ? <Spinner size={13} className="mr-1.5" /> : <Save size={14} />}
          {t('actions.save', { ns: 'common' })}
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <KeyRound size={14} className="text-indigo-500" />
          {t('account.passwordSection')}
        </h2>
        {field(
          t('account.currentPasswordLabel'),
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />,
        )}
        {field(
          t('account.newPasswordLabel'),
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />,
        )}
        {field(
          t('account.confirmPasswordLabel'),
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />,
        )}
        <Button
          onClick={handleChangePassword}
          disabled={savingPassword || !currentPassword || !newPassword}
          className="w-full"
          variant="outline"
        >
          {savingPassword && <Spinner size={13} className="mr-1.5" />}
          {t('account.changePasswordButton')}
        </Button>
      </section>
    </div>
  );
}
