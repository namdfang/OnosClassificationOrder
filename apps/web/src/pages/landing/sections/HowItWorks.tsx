import React from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, LayoutGrid, MapPin, UserPlus } from 'lucide-react';

import { PATHS } from '@/constants/paths';

import PillLink from '@/components/public/PillLink';
import Reveal from '@/components/public/Reveal';
import SectionHeading from '@/components/public/SectionHeading';

const STEPS = [
  { key: 'account', icon: UserPlus },
  { key: 'choose', icon: LayoutGrid },
  { key: 'submit', icon: ClipboardCheck },
  { key: 'track', icon: MapPin },
];

/** Bốn bước đặt đơn — section chính của trang, đứng ngay sau phần vấn đề. */
function HowItWorks() {
  const { t } = useTranslation('landing');

  return (
    <section id="how" className="scroll-mt-24 bg-slate-50/70">
      <div className="mx-auto max-w-6xl px-4 py-20 lg:py-24">
        <SectionHeading
          eyebrow={t('howItWorks.eyebrow')}
          lead={t('howItWorks.titleLead')}
          accent={t('howItWorks.titleAccent')}
          subtitle={t('howItWorks.subtitle')}
        />

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ key, icon: Icon }, index) => (
            <Reveal key={key} delay={index * 90}>
              <li className="relative h-full rounded-2xl border border-slate-200 bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon size={19} />
                </span>

                <span className="absolute right-5 top-5 font-display text-2xl font-medium text-brand-200">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <h3 className="mt-5 font-display text-lg font-medium leading-snug text-[#0f110f]">
                  {t(`howItWorks.steps.${key}.title`)}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                  {t(`howItWorks.steps.${key}.description`)}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>

        <Reveal delay={380}>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <PillLink to={PATHS.CUSTOMER_REGISTER}>{t('actions.order')}</PillLink>
            <PillLink to={PATHS.CUSTOMER_LOGIN} variant="outline" withArrow={false}>
              {t('actions.customerSignIn')}
            </PillLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default HowItWorks;
