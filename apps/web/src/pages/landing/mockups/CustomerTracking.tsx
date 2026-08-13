import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

import { cn } from '@/utils/cn';

/**
 * Minh hoạ trang tra tiến trình đơn phía khách hàng
 * (mirror `pages/customer/orders/track.tsx`) — không lộ xưởng/máy/người làm.
 */

const STEPS = [
  { key: 'received', state: 'done' },
  { key: 'design', state: 'done' },
  { key: 'printing', state: 'current' },
  { key: 'packing', state: 'todo' },
  { key: 'shipped', state: 'todo' },
] as const;

function CustomerTracking() {
  const { t } = useTranslation('landing');

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2 border-b border-slate-200 pb-2.5">
        <span className="text-[0.58rem] font-medium uppercase tracking-wide text-slate-500">
          {t('mockup.tracking.orderLabel')}
        </span>
        <span className="font-mono text-xs font-semibold text-[#0f110f]">#1042</span>
      </div>

      <ol className="space-y-0">
        {STEPS.map((step, index) => {
          const isDone = step.state === 'done';
          const isCurrent = step.state === 'current';
          const isLast = index === STEPS.length - 1;

          return (
            <li key={step.key} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[0.5rem] font-bold',
                    isDone && 'border-emerald-500 bg-emerald-500 text-white',
                    isCurrent && 'border-brand-600 bg-brand-600 text-white',
                    !isDone && !isCurrent && 'border-slate-200 bg-white text-slate-300',
                  )}
                >
                  {isDone ? <Check size={11} /> : index + 1}
                </span>
                {!isLast && (
                  <span className={cn('min-h-[0.75rem] w-0.5 flex-1', isDone ? 'bg-emerald-400' : 'bg-slate-200')} />
                )}
              </div>

              <div className={cn('min-w-0 pb-3', isLast && 'pb-0')}>
                <p
                  className={cn(
                    'truncate text-[0.68rem] font-medium',
                    isCurrent ? 'text-brand-700' : isDone ? 'text-[#0f110f]' : 'text-slate-400',
                  )}
                >
                  {t(`mockup.tracking.steps.${step.key}`)}
                </p>
                {isCurrent && (
                  <span className="mt-0.5 inline-block rounded bg-brand-50 px-1.5 py-px text-[0.5rem] font-semibold uppercase tracking-wide text-brand-700">
                    {t('mockup.tracking.currentLabel')}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default CustomerTracking;
