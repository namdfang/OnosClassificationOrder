import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Briefcase, Mail } from 'lucide-react';

import { PATHS } from '@/constants/paths';

import PillLink from '@/components/public/PillLink';
import Reveal from '@/components/public/Reveal';

/**
 * CTA đóng trang — một hành động chính duy nhất: khách hàng đặt đơn.
 * Lối vào cho nhân viên cố ý để nhỏ bên dưới, không cạnh tranh với CTA chính.
 */
function FinalCta() {
  const { t } = useTranslation('landing');

  return (
    <section className="relative overflow-hidden bg-ink-900">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(111,38,194,0.35),rgba(111,38,194,0)_65%)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-20 text-center lg:py-24">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">{t('cta.eyebrow')}</p>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight text-white lg:text-[2.75rem]">
            {t('cta.title')}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/65">{t('cta.subtitle')}</p>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PillLink to={PATHS.CUSTOMER_REGISTER}>{t('actions.order')}</PillLink>
            <PillLink to={PATHS.CUSTOMER_LOGIN} variant="outlineDark" withArrow={false}>
              {t('actions.customerSignIn')}
            </PillLink>
          </div>
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-14 space-y-2 border-t border-white/10 pt-8 text-sm text-white/50">
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <Mail size={14} className="shrink-0" />
              {t('cta.supportNote')}
              <a
                href={`mailto:${t('footer.contact.email')}`}
                className="font-semibold text-white/85 underline underline-offset-4 transition-colors hover:text-white"
              >
                {t('footer.contact.email')}
              </a>
            </p>
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              {t('cta.staffNote')}
              <Link
                to={PATHS.LOGIN}
                className="font-semibold text-white/75 underline underline-offset-4 transition-colors hover:text-white"
              >
                {t('cta.staffLink')}
              </Link>
            </p>
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <Briefcase size={14} className="shrink-0" />
              {t('cta.careers.text')}
              <Link
                to={PATHS.COMPANY_CAREERS}
                className="font-semibold text-brand-300 underline underline-offset-4 transition-colors hover:text-white"
              >
                {t('cta.careers.link')}
              </Link>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default FinalCta;
