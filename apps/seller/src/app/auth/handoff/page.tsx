'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Nhận `#token=…&exp=…` từ app admin (fragment không tới server/log), đổi thành cookie rồi vào portal. */
export default function HandoffPage() {
  const { t } = useTranslation('seller');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('token');
    const exp = Number(hash.get('exp') || 0);
    history.replaceState(null, '', '/auth/handoff');
    const run = async () => {
      if (!token) throw new Error('missing token');
      const res = await fetch('/api/auth/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, exp: exp || undefined }),
      });
      if (!res.ok) throw new Error('handoff failed');
      window.location.replace('/portal/orders');
    };
    run().catch(() => setFailed(true));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      {failed ? (
        <p className="text-sm text-error max-w-sm text-center px-4">{t('handoff.failed')}</p>
      ) : (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          {t('handoff.working')}
        </div>
      )}
    </div>
  );
}
