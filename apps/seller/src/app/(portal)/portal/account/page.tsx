'use client';

import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { KeyRound, Pencil, Save, X } from 'lucide-react';
import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { PageHeader } from '@/components/shared/page-header';
import { useToast } from '@/components/shared/toast';
import { useSession } from '@/context/session-context';
import { apiFetch } from '@/hooks/use-api';

const inputCls = 'w-full px-2.5 py-1.5 rounded-lg border border-border1 bg-card text-[12px] text-text-primary outline-none focus:border-accent disabled:opacity-60';
const TIER_COLORS = ['#6b7280', '#48a05c', '#7f9a2b', '#c9a400', '#e01008', '#c40c68'];

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border1 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">{label}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-[11px]">
      <div className="text-text-muted uppercase text-[9px] font-bold tracking-wider mb-0.5">{label}</div>
      <div className="text-text-primary">{children}</div>
    </div>
  );
}

/** Trang tài khoản — khuôn `portal/profile` của thghub: card gọn, nhãn mục uppercase, lưới 2 cột, sửa tại chỗ. */
export default function AccountPage() {
  const { t } = useTranslation(['customerPortal', 'seller', 'hub']);
  const { toast } = useToast();
  const { profile, refresh } = useSession();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const name = profile?.fullName || profile?.userSku || profile?.userEmail || '';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || 'S';
  const tier = profile?.tier ?? null;
  const tierColor = tier == null ? TIER_COLORS[0] : (TIER_COLORS[tier] ?? TIER_COLORS[0]);

  const startEdit = () => {
    setFullName(profile?.fullName ?? '');
    setPhone(profile?.phone ?? '');
    setEditing(true);
  };
  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/v1/customer/auth/me', { method: 'PATCH', body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim() }) });
      refresh();
      setEditing(false);
      toast('success', t('customerPortal:account.profileSaved'));
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const changePassword = async () => {
    if (pw.next.length < 6) return toast('error', t('customerPortal:account.passwordTooShort'));
    if (pw.next !== pw.confirm) return toast('error', t('customerPortal:account.passwordMismatch'));
    setSavingPw(true);
    try {
      await apiFetch('/api/v1/customer/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
      toast('success', t('customerPortal:account.passwordChanged'));
      setPw({ current: '', next: '', confirm: '' });
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title={t('customerPortal:account.title')} subtitle={t('seller:account.subtitle')} />

      <Section
        label={t('customerPortal:account.profileSection')}
        action={
          editing ? (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}><X size={12} className="mr-1" />{t('seller:detail.cancel')}</Button>
              <Button variant="primary" size="sm" loading={saving} onClick={saveProfile}><Save size={12} className="mr-1" />{t('seller:detail.save')}</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={startEdit}><Pencil size={12} className="mr-1" />{t('hub:sellers.edit')}</Button>
          )
        }
      >
        <div className="flex items-center gap-3 border-b border-border2 pb-3">
          <div className="w-11 h-11 rounded-full bg-accent flex items-center justify-center text-white text-[13px] font-bold shrink-0">{initials}</div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-text-primary truncate">{name}</div>
            <div className="text-[10.5px] text-text-muted truncate">{profile?.userEmail}</div>
          </div>
          <div className="ml-auto shrink-0">
            <Badge bg={tierColor + '18'} color={tierColor}>{tier == null ? t('hub:sellers.tierNone') : t('hub:sellers.tier', { n: tier })}</Badge>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('customerPortal:account.skuLabel')}><span className="font-mono">{profile?.userSku || '—'}</span></Field>
          <Field label={t('customerPortal:account.emailLabel')}>{profile?.userEmail || '—'}</Field>
          <Field label={t('customerPortal:account.nameLabel')}>
            {editing ? <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} autoFocus /> : profile?.fullName || '—'}
          </Field>
          <Field label={t('customerPortal:account.phoneLabel')}>
            {editing ? <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /> : profile?.phone || '—'}
          </Field>
          <Field label={t('seller:account.memberSince')}>{profile?.createdAt ? dayjs(profile.createdAt).format('DD/MM/YYYY') : '—'}</Field>
          <Field label={t('seller:account.source')}>{profile?.source ? t(`seller:account.sources.${profile.source}`, { defaultValue: profile.source }) : '—'}</Field>
        </div>
        <p className="text-[10px] text-text-muted">{t('customerPortal:account.lockedKeyNote')}</p>
      </Section>

      <Section label={t('customerPortal:account.passwordSection')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t('customerPortal:account.currentPasswordLabel')}><input type="password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} className={inputCls} autoComplete="current-password" /></Field>
          <Field label={t('customerPortal:account.newPasswordLabel')}><input type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} className={inputCls} autoComplete="new-password" /></Field>
          <Field label={t('customerPortal:account.confirmPasswordLabel')}><input type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} className={inputCls} autoComplete="new-password" /></Field>
        </div>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" loading={savingPw} disabled={!pw.current || !pw.next} onClick={changePassword}>
            <KeyRound size={12} className="mr-1" />{t('customerPortal:account.changePasswordButton')}
          </Button>
        </div>
      </Section>

      <p className="text-[11px] text-text-muted">
        <Link href="/portal/api" prefetch={false} className="text-accent hover:underline">{t('seller:account.integrationsOpen')} →</Link>
      </p>
    </div>
  );
}