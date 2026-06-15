import React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/utils/cn';

interface Props {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  accent?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
  loading?: boolean;
}

const ACCENT_BG: Record<NonNullable<Props['accent']>, string> = {
  default: 'bg-card',
  primary: 'bg-indigo-50 dark:bg-indigo-900/20',
  success: 'bg-emerald-50 dark:bg-emerald-900/20',
  warning: 'bg-amber-50 dark:bg-amber-900/20',
  danger: 'bg-red-50 dark:bg-red-900/20',
};

const ACCENT_TEXT: Record<NonNullable<Props['accent']>, string> = {
  default: 'text-foreground',
  primary: 'text-indigo-700 dark:text-indigo-200',
  success: 'text-emerald-700 dark:text-emerald-200',
  warning: 'text-amber-700 dark:text-amber-200',
  danger: 'text-red-700 dark:text-red-200',
};

export function KpiCard({ label, value, hint, icon: Icon, accent = 'default', onClick, loading }: Props) {
  const accentBg = ACCENT_BG[accent];
  const accentText = ACCENT_TEXT[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group rounded-lg border border-border p-3.5 text-left flex items-start gap-3 min-w-0',
        accentBg,
        onClick && 'hover:border-primary/40 cursor-pointer transition-colors',
        !onClick && 'cursor-default',
      )}
    >
      {Icon && (
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white/60 dark:bg-black/20', accentText)}>
          <Icon size={18} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <p className={cn('text-2xl font-bold leading-tight mt-0.5', accentText)}>
          {loading ? '…' : value}
        </p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
      </div>
    </button>
  );
}
