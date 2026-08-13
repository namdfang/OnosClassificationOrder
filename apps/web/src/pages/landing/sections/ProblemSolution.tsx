import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';

import Reveal from '@/components/public/Reveal';
import SectionHeading from '@/components/public/SectionHeading';

const ITEMS = ['silence', 'chat', 'quality', 'scale'];

function ProblemSolution() {
  const { t } = useTranslation('landing');

  return (
    <section id="why" className="scroll-mt-24 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-20 lg:py-24">
        <SectionHeading
          eyebrow={t('problems.eyebrow')}
          lead={t('problems.titleLead')}
          accent={t('problems.titleAccent')}
          subtitle={t('problems.subtitle')}
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {ITEMS.map((key, index) => (
            <Reveal key={key} delay={index * 90}>
              <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-shadow duration-300 hover:shadow-[0_18px_50px_-28px_rgba(15,17,15,0.4)]">
                <span className="font-display text-2xl font-medium text-brand-300">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <p className="mt-3 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-slate-400">
                  {t('problems.problemLabel')}
                </p>
                <h3 className="mt-1.5 font-display text-lg font-medium leading-snug text-[#0f110f]">
                  {t(`problems.items.${key}.problem`)}
                </h3>

                {/* `flex-1 items-end` giữ khối giải pháp luôn nằm sát đáy card, để
                    các card cùng hàng thẳng nhau dù tiêu đề dài ngắn khác nhau. */}
                <div className="mt-5 flex flex-1 items-end">
                  <div className="flex w-full gap-3 rounded-xl bg-brand-50/70 p-4">
                    <ArrowRight size={16} className="mt-0.5 shrink-0 text-brand-600" />
                    <div>
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-brand-600">
                        {t('problems.solutionLabel')}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                        {t(`problems.items.${key}.solution`)}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProblemSolution;
