import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

import Reveal from '@/components/public/Reveal';
import SectionHeading from '@/components/public/SectionHeading';

import { cn } from '@/utils/cn';

import AppFrame from '../components/AppFrame';
import CatalogGrid from '../mockups/CatalogGrid';
import CustomerTracking from '../mockups/CustomerTracking';
import LifecycleFunnel from '../mockups/LifecycleFunnel';

const ROWS: {
  key: string;
  Mockup: () => React.JSX.Element;
  /** Key nhãn khung cửa sổ trong `landing.mockup.*`. */
  frameKey: string;
  anchor?: string;
}[] = [
  { key: 'catalog', Mockup: CatalogGrid, frameKey: 'catalog' },
  { key: 'tracking', Mockup: CustomerTracking, frameKey: 'tracking' },
  { key: 'production', Mockup: LifecycleFunnel, frameKey: 'production' },
];

function Showcase() {
  const { t } = useTranslation('landing');

  return (
    <section id="workflow" className="scroll-mt-24 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-20 lg:py-24">
        <SectionHeading
          eyebrow={t('showcase.eyebrow')}
          lead={t('showcase.titleLead')}
          accent={t('showcase.titleAccent')}
          subtitle={t('showcase.subtitle')}
        />

        <div className="mt-16 space-y-20 lg:space-y-24">
          {ROWS.map(({ key, Mockup, frameKey, anchor }, index) => {
            const points = t(`showcase.items.${key}.points`, { returnObjects: true }) as string[];
            const visualFirst = index % 2 === 1;

            return (
              <div key={key} id={anchor} className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-14">
                <Reveal className={cn(visualFirst && 'lg:order-last')}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                    {t(`showcase.items.${key}.eyebrow`)}
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-medium leading-snug tracking-tight text-[#0f110f] lg:text-3xl">
                    {t(`showcase.items.${key}.title`)}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-slate-600">
                    {t(`showcase.items.${key}.description`)}
                  </p>

                  <ul className="mt-6 space-y-3">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm text-slate-700">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                          <Check size={12} />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </Reveal>

                <Reveal delay={120}>
                  <AppFrame
                    title={t(`mockup.${frameKey}.title`)}
                    subtitle={frameKey === 'production' ? t('mockup.production.subtitle') : undefined}
                  >
                    <Mockup />
                  </AppFrame>
                  <p className="mt-4 text-[0.65rem] text-slate-400">{t('showcase.caption')}</p>
                </Reveal>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Showcase;
