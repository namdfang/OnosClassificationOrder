import React from 'react';

import { cn } from '@/utils/cn';

type Tone = 'emerald' | 'rose' | 'amber' | 'slate';

/** Khung VÙNG bao quanh 1 nhóm bước (Hoàn thành / Báo lỗi / Quét tiếp). */
const ZONES: Record<Tone, { box: string; label: string }> = {
  emerald: {
    box: 'border-emerald-400/60 dark:border-emerald-500/40',
    label: 'text-emerald-700 dark:text-emerald-300',
  },
  rose: {
    box: 'border-rose-400/60 dark:border-rose-500/40',
    label: 'text-rose-700 dark:text-rose-300',
  },
  amber: {
    box: 'border-amber-400/60 dark:border-amber-500/40',
    label: 'text-amber-700 dark:text-amber-300',
  },
  slate: {
    box: 'border-border',
    label: 'text-muted-foreground',
  },
};

const TONES: Record<Tone, { box: string; badge: string; title: string }> = {
  emerald: {
    box: 'border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5',
    badge: 'bg-emerald-500 text-white',
    title: 'text-emerald-700 dark:text-emerald-300',
  },
  rose: {
    box: 'border-rose-300/60 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/5',
    badge: 'bg-rose-500 text-white',
    title: 'text-rose-700 dark:text-rose-300',
  },
  amber: {
    box: 'border-amber-300/60 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5',
    badge: 'bg-amber-500 text-white',
    title: 'text-amber-700 dark:text-amber-300',
  },
  slate: {
    box: 'border-border bg-muted/40',
    badge: 'bg-slate-500 text-white',
    title: 'text-foreground',
  },
};

/**
 * Vùng hướng dẫn — viền màu đậm + tiêu đề vùng UPPERCASE + slot `action` góc
 * phải (vd link "Thêm lỗi ở đây"). Chia hướng dẫn thành các vùng Hoàn thành /
 * Báo lỗi / Quét tiếp cho dễ nhìn. Xem StageErrorCatalog.md.
 */
export function GuideZone({
  label,
  tone,
  action,
  children,
}: {
  label: string;
  tone: Tone;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const z = ZONES[tone];
  return (
    <div className={cn('rounded-xl border-2 p-3', z.box)}>
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <span className={cn('text-base font-bold uppercase tracking-wide', z.label)}>{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * 1 bước hướng dẫn to (số thứ tự + icon + title + mô tả) cho 2 modal quét mã —
 * công nhân đứng xa vẫn đọc được. Xem StageErrorCatalog.md.
 */
export function GuideStep({
  step,
  icon,
  title,
  desc,
  tone,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tone: Tone;
}) {
  const t = TONES[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-3.5', t.box)}>
      <span
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold shrink-0 tabular-nums',
          t.badge,
        )}
      >
        {step}
      </span>
      <div className="min-w-0">
        <div className={cn('flex items-center gap-2 text-lg font-semibold leading-tight', t.title)}>
          {icon}
          {title}
        </div>
        <div className="mt-0.5 text-base text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
