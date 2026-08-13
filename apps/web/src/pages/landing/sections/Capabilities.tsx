import React from 'react';
import { useTranslation } from 'react-i18next';

import Reveal from '@/components/public/Reveal';

const ITEMS = ['selfServe', 'visibility', 'accountable', 'factory'];

/**
 * Dải năng lực trên nền tối.
 *
 * Nội dung nói với KHÁCH HÀNG (vì sao nên đặt đơn ở Onos), không mô tả năng lực
 * kỹ thuật của hệ thống. CỐ Ý không có con số nào — số chặng/công đoạn/mức ưu
 * tiên là cấu hình vận hành nội bộ. Xem Landing.md §8.
 */
function Capabilities() {
  const { t } = useTranslation('landing');

  return (
    <section className="bg-ink-800">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">{t('capabilities.eyebrow')}</p>
        </Reveal>

        <dl className="mt-8 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((key, index) => (
            <Reveal key={key} delay={index * 80}>
              <dt className="font-display text-lg font-medium leading-snug text-white">
                {t(`capabilities.items.${key}.title`)}
              </dt>
              <dd className="mt-2.5 text-sm leading-relaxed text-white/60">{t(`capabilities.items.${key}.label`)}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}

export default Capabilities;
