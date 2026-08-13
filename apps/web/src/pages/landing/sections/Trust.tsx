import React from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, FileClock, ShieldCheck } from 'lucide-react';

import Reveal from '@/components/public/Reveal';
import SectionHeading from '@/components/public/SectionHeading';

const ITEMS = [
  { key: 'own', icon: Building2 },
  { key: 'audit', icon: FileClock },
  { key: 'privacy', icon: ShieldCheck },
];

function Trust() {
  const { t } = useTranslation('landing');
  const marquee = t('trust.marquee');

  return (
    <section id="quality" className="scroll-mt-24 bg-white">
      {/* Dải chữ chạy — nhắc lại rằng đây là hệ thống đang chạy thật, không phải bản demo.
          Nội dung lặp 2 lần để cuộn liền mạch; dừng lại khi người dùng tắt chuyển động. */}
      <div className="overflow-hidden border-y border-brand-100 bg-gradient-to-r from-brand-50 via-brand-100/70 to-brand-50 py-4">
        <div
          aria-hidden="true"
          className="flex w-max animate-marquee items-center gap-10 whitespace-nowrap motion-reduce:animate-none"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="flex items-center gap-10">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-800">{marquee}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            </span>
          ))}
        </div>
        <span className="sr-only">{marquee}</span>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-20 lg:py-24">
        <SectionHeading
          eyebrow={t('trust.eyebrow')}
          lead={t('trust.titleLead')}
          accent={t('trust.titleAccent')}
          align="center"
        />

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {ITEMS.map(({ key, icon: Icon }, index) => (
            <Reveal key={key} delay={index * 90}>
              <article className="h-full rounded-2xl border border-slate-200 bg-white p-6 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <Icon size={20} />
                </span>
                <h3 className="mt-5 font-display text-lg font-medium text-[#0f110f]">
                  {t(`trust.items.${key}.title`)}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{t(`trust.items.${key}.description`)}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Trust;
