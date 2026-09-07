'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { OnosLogo } from '@/components/brand/logo';

export default function TrackIndexPage() {
  const router = useRouter();
  const { t } = useTranslation('track');
  const [input, setInput] = useState('');
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-block mb-6"><OnosLogo title={t('meta.title')} subtitle="ONOS FACTORY" /></div>
        <p className="text-sm text-text-secondary mb-4">{t('meta.subtitle')}</p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (input.trim()) router.push(`/track/${encodeURIComponent(input.trim())}`); }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('search.placeholder')} className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border1 bg-card text-sm font-mono outline-none focus:border-accent" />
          </div>
          <button type="submit" className="px-4 py-2.5 rounded-lg bg-cta text-cta-foreground text-sm font-semibold hover:bg-cta-hover">{t('search.submit')}</button>
        </form>
        <p className="mt-2 text-xs text-text-muted">{t('search.hint')}</p>
      </div>
    </div>
  );
}
