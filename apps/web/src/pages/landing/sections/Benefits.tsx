import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Database } from 'lucide-react';

import Reveal from '@/components/public/Reveal';
import SectionHeading from '@/components/public/SectionHeading';

function Benefits() {
  const { t } = useTranslation('landing');
  const items = t('benefits.items', { returnObjects: true }) as string[];

  return (
    <section id="benefits" className="scroll-mt-24 bg-slate-50/70">
      <div className="mx-auto max-w-6xl px-4 py-20 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-16">
          <div>
            <SectionHeading
              eyebrow={t('benefits.eyebrow')}
              lead={t('benefits.titleLead')}
              accent={t('benefits.titleAccent')}
              subtitle={t('benefits.subtitle')}
            />

            {/* Thẻ nhấn — bo góc lệch, chi tiết hình khối của nhận diện Onos. */}
            <Reveal delay={160}>
              <div className="mt-10 rounded-[2rem] rounded-br-none bg-gradient-to-br from-brand-50 to-brand-100/60 p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
                  <Database size={19} />
                </span>
                <h3 className="mt-5 font-display text-lg font-medium text-[#0f110f]">{t('benefits.cardTitle')}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{t('benefits.cardDescription')}</p>
              </div>
            </Reveal>
          </div>

          <ul className="space-y-3">
            {items.map((item, index) => (
              <Reveal key={item} delay={index * 70}>
                <li className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                    <Check size={13} />
                  </span>
                  <span className="text-sm leading-relaxed text-slate-700">{item}</span>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default Benefits;
