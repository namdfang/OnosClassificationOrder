'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { OnosMark } from '@/components/brand/logo';
import { useLanguage } from '@/components/providers/i18n-provider';
import { useSession } from '@/context/session-context';

function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/portal/orders';
  return raw;
}

function LoginContent() {
  const { t } = useTranslation(['customerPortal', 'seller', 'track']);
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safeCallback(params.get('callbackUrl'));
  const { refresh } = useSession();
  const { language, toggleLanguage } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!email.trim() || !password) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userEmail: email.trim().toLowerCase(), password, rememberMe: remember }),
        });
        if (!res.ok) {
          setError(res.status === 401 ? t('seller:login.failed') : res.status === 423 ? t('seller:login.locked') : t('seller:login.generic'));
          return;
        }
        refresh();
        router.replace(callbackUrl);
      } catch {
        setError(t('seller:login.generic'));
      } finally {
        setLoading(false);
      }
    },
    [email, password, remember, callbackUrl, refresh, router, t],
  );

  const inputCls =
    'w-full pl-9 pr-3 py-2.5 rounded-lg border border-border1 bg-card text-[13px] text-text-primary outline-none focus:border-accent placeholder:text-text-placeholder';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <OnosMark className="inline-block w-20 h-20 mb-4" />
          <h1 className="text-2xl font-extrabold text-text-primary font-display">{t('seller:login.welcome')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('seller:login.hint')}</p>
        </div>

        <div className="rounded-xl p-6 bg-card border border-border1 shadow-card">
          {error && (
            <div className="mb-4 p-3 rounded-lg text-xs font-medium bg-error-bg text-error border border-error/30" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-[10px] text-text-muted font-semibold uppercase block mb-1">{t('customerPortal:login.email')}</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder={t('customerPortal:login.emailPlaceholder')}
                  autoComplete="username"
                  required
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-text-muted font-semibold uppercase block mb-1">{t('customerPortal:login.password')}</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder={t('customerPortal:login.passwordPlaceholder')}
                  autoComplete="current-password"
                  required
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? t('customerPortal:login.hidePassword') : t('customerPortal:login.showPassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer w-fit">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-accent)]" />
              {t('customerPortal:login.rememberMe')}
            </label>
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-cta text-cta-foreground hover:bg-cta-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? t('seller:login.submitting') : t('customerPortal:login.submit')}
            </button>
          </form>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3 text-[11px] text-text-muted">
          <Link href="/track" prefetch={false} className="hover:text-accent">{t('customerPortal:layout.nav.track', { defaultValue: t('track:meta.title', { ns: 'track' }) })}</Link>
          <span>·</span>
          <button type="button" onClick={toggleLanguage} className="hover:text-accent">{language === 'vi' ? 'English' : 'Tiếng Việt'}</button>
        </div>
        <p className="text-center text-[10px] text-text-muted mt-3">{t('seller:login.footer')}</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
