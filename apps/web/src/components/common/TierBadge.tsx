import React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/utils/cn';

/** Màu badge theo tier VIP 0..5; khách lẻ (tier null) dùng style riêng. */
const TIER_STYLES: Record<number, string> = {
  0: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  1: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  2: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  3: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  4: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
  5: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
};
const RETAIL_STYLE = 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400';

export function TierBadge({ tier }: { tier: number | null | undefined }) {
  const { t } = useTranslation('customerFactoryAssignment');
  const isVip = typeof tier === 'number' && tier >= 0 && tier <= 5;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap',
        isVip ? TIER_STYLES[tier as number] : RETAIL_STYLE,
      )}
    >
      {isVip ? t('tier.vip', { tier }) : t('tier.retail')}
    </span>
  );
}
