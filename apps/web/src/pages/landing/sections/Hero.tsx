import React from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, RefreshCw } from 'lucide-react';

import { PATHS } from '@/constants/paths';

import PillLink from '@/components/public/PillLink';
import Reveal from '@/components/public/Reveal';
import Swoosh from '@/components/public/Swoosh';

import AppFrame from '../components/AppFrame';
import CustomerTracking from '../mockups/CustomerTracking';

function Hero() {
  const { t } = useTranslation('landing');

  return (
    <section className="relative overflow-hidden">
      {/* Khối sáng nền — vệt tím mờ phía sau ảnh sản phẩm, không chắn nội dung. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-18%] top-[-22%] h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(circle,rgba(111,38,194,0.14),rgba(111,38,194,0)_62%)]"
      />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10 lg:py-24">
        <div>
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{t('hero.eyebrow')}</p>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mt-4 font-display text-[2.15rem] font-medium leading-[1.14] tracking-tight text-[#0f110f] sm:text-5xl lg:text-[3.4rem]">
              {t('hero.titleLead')}{' '}
              <span className="relative inline-block whitespace-nowrap">
                {t('hero.titleAccent')}
                <Swoosh />
              </span>{' '}
              {t('hero.titleTail')}
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-600">{t('hero.subtitle')}</p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <PillLink to={PATHS.CUSTOMER_REGISTER}>{t('actions.order')}</PillLink>
              <PillLink href="#how" variant="outline">
                {t('actions.seeHow')}
              </PillLink>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <p className="mt-6 text-xs text-slate-500">{t('hero.note')}</p>
          </Reveal>
        </div>

        <Reveal delay={200}>
          {/* Bọc riêng khung + 2 thẻ nổi để thẻ bám đúng góc khung, không trôi
              xuống theo dòng chú thích bên dưới. */}
          <div className="relative">
            <AppFrame title={t('mockup.tracking.title')}>
              <CustomerTracking />
            </AppFrame>

            <div className="absolute -left-4 -top-5 hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg lg:flex">
              <RefreshCw size={14} className="shrink-0 text-emerald-600" />
              <span className="text-[0.68rem] font-semibold text-[#0f110f]">{t('hero.badgeUpdate')}</span>
            </div>

            <div className="absolute -bottom-5 right-4 hidden items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-2 shadow-lg sm:flex">
              <BellRing size={14} className="shrink-0 text-brand-600" />
              <span className="text-[0.68rem] font-semibold text-[#0f110f]">{t('hero.badgeNotify')}</span>
            </div>
          </div>

          <p className="mt-8 text-center text-[0.65rem] text-slate-400 lg:text-left">{t('hero.panelCaption')}</p>
        </Reveal>
      </div>
    </section>
  );
}

export default Hero;
