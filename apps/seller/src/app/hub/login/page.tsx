'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { OnosMark } from '@/components/brand/logo';

function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith('/hub')) return '/hub';
  return raw;
}

function HubLoginContent() {
  const { t } = useTranslation('hub');
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safeCallback(params.get('callbackUrl'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputCls = 'w-full pl-9 pr-3 py-2.5 rounded-lg border border-border1 bg-card text-[13px] text-text-primary outline-none focus:border-accent placeholder:text-text-placeholder';

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hub/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password, rememberMe: remember }) });
      if (!res.ok) {
        setError(res.status === 403 ? t('login.forbidden') : res.status === 401 || res.status === 400 || res.status === 422 ? t('login.failed') : t('login.generic'));
        return;
      }
      router.replace(callbackUrl);
    } catch {
      setError(t('login.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <OnosMark className="inline-block w-20 h-20 mb-4" />
          <h1 className="text-2xl font-extrabold text-text-primary font-display">{t('login.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('login.hint')}</p>
        </div>
        <div className="rounded-xl p-6 bg-card border border-border1 shadow-card">
          {error && <div className="mb-4 p-3 rounded-lg text-xs font-medium bg-error-bg text-error border border-error/30" role="alert">{error}</div>}
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-[10px] text-text-muted font-semibold uppercase block mb-1">{t('login.email')}</label>
              <div className="relative"><Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" className={inputCls} placeholder="admin@onosfactory.com" /></div>
            </div>
            <div>
              <label className="text-[10px] text-text-muted font-semibold uppercase block mb-1">{t('login.password')}</label>
              <div className="relative"><Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className={inputCls} placeholder="••••••••" /></div>
            </div>
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer w-fit"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-accent)]" />{t('login.remember')}</label>
            <button type="submit" disabled={loading || !email || !password} className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-cta text-cta-foreground hover:bg-cta-hover transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2">
              <ShieldCheck size={15} />{loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>
        <p className="text-center text-[10px] text-text-muted mt-6">{t('login.footer')}</p>
      </div>
    </div>
  );
}

export default function HubLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}>
      <HubLoginContent />
    </Suspense>
  );
}
