import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, User } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { handleAxiosError } from '@/utils';

type PwField = 'oldPassword' | 'newPassword' | 'newConfirmPassword';

interface PwForm {
  oldPassword: string;
  newPassword: string;
  newConfirmPassword: string;
}

const EMPTY_PW_FORM: PwForm = {
  oldPassword: '',
  newPassword: '',
  newConfirmPassword: '',
};

export default function Account() {
  const { profile } = useAuthStore();

  const [pwForm, setPwForm] = useState<PwForm>(EMPTY_PW_FORM);
  const [show, setShow] = useState<Record<PwField, boolean>>({
    oldPassword: false,
    newPassword: false,
    newConfirmPassword: false,
  });
  const [saving, setSaving] = useState(false);

  const toggleShow = (k: PwField) => setShow((prev) => ({ ...prev, [k]: !prev[k] }));

  const handleChangePassword = async () => {
    const { oldPassword, newPassword, newConfirmPassword } = pwForm;
    if (!oldPassword || !newPassword || !newConfirmPassword) {
      toast.error('Vui lòng nhập đủ 3 trường');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Mật khẩu mới tối thiểu 8 ký tự');
      return;
    }
    if (newPassword !== newConfirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }
    if (oldPassword === newPassword) {
      toast.error('Mật khẩu mới phải khác mật khẩu cũ');
      return;
    }
    try {
      setSaving(true);
      await RepositoryRemote.users.changePassword({
        oldPassword,
        newPassword,
        newConfirmPassword,
      });
      toast.success('Đã đổi mật khẩu thành công');
      setPwForm(EMPTY_PW_FORM);
      setShow({ oldPassword: false, newPassword: false, newConfirmPassword: false });
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
          <User size={20} className="text-rose-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Account</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Your profile and preferences</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700/60">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Full name</p>
            <p className="text-base text-slate-800 dark:text-slate-100 mt-1">{profile?.fullName || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Email</p>
            <p className="text-base text-slate-800 dark:text-slate-100 mt-1">{profile?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Role</p>
            <p className="text-base text-slate-800 dark:text-slate-100 mt-1">{profile?.role?.name || '—'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound size={18} className="text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Đổi mật khẩu
          </h2>
        </div>

        <div className="space-y-3 max-w-md">
          <PasswordInput
            label="Mật khẩu hiện tại"
            value={pwForm.oldPassword}
            onChange={(v) => setPwForm({ ...pwForm, oldPassword: v })}
            show={show.oldPassword}
            onToggle={() => toggleShow('oldPassword')}
            autoComplete="current-password"
          />
          <PasswordInput
            label="Mật khẩu mới"
            value={pwForm.newPassword}
            onChange={(v) => setPwForm({ ...pwForm, newPassword: v })}
            show={show.newPassword}
            onToggle={() => toggleShow('newPassword')}
            placeholder="Tối thiểu 8 ký tự"
            autoComplete="new-password"
          />
          <PasswordInput
            label="Xác nhận mật khẩu mới"
            value={pwForm.newConfirmPassword}
            onChange={(v) => setPwForm({ ...pwForm, newConfirmPassword: v })}
            show={show.newConfirmPassword}
            onToggle={() => toggleShow('newConfirmPassword')}
            placeholder="Nhập lại mật khẩu mới"
            autoComplete="new-password"
          />

          <div className="pt-2 flex items-center gap-3">
            <Button onClick={handleChangePassword} disabled={saving}>
              {saving && <Spinner size={14} className="mr-2" />}
              Đổi mật khẩu
            </Button>
            {(pwForm.oldPassword || pwForm.newPassword || pwForm.newConfirmPassword) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPwForm(EMPTY_PW_FORM);
                  setShow({ oldPassword: false, newPassword: false, newConfirmPassword: false });
                }}
                disabled={saving}
              >
                Huỷ
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
  autoComplete?: string;
}

function PasswordInput({
  label,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  autoComplete,
}: PasswordInputProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="pr-9"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggle}
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
