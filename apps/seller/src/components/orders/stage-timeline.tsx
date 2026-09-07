'use client';

import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Check, CircleDashed, Loader2, TriangleAlert, Wrench } from 'lucide-react';

export interface StageLike {
  key: string;
  label?: string;
  status: 'done' | 'current' | 'error' | 'rework' | 'pending' | string;
  at?: string | Date;
}

const ICON: Record<string, React.ReactNode> = {
  done: <Check size={12} />,
  current: <Loader2 size={12} className="animate-spin" />,
  error: <TriangleAlert size={12} />,
  rework: <Wrench size={12} />,
  pending: <CircleDashed size={12} />,
};
const COLOR: Record<string, string> = {
  done: '#15803d',
  current: '#4338ca',
  error: '#b91c1c',
  rework: '#b45309',
  pending: '#9ca3af',
};

/** 8 chặng `LIFECYCLE_STAGE_KEYS` — nhãn dịch từ `track.progress.stages.*`, fallback nhãn BE. */
export function StageTimeline({ stages }: { stages: StageLike[] }) {
  const { t } = useTranslation('track');
  return (
    <ol className="space-y-0">
      {stages.map((s, i) => {
        const color = COLOR[s.status] ?? COLOR.pending;
        const last = i === stages.length - 1;
        return (
          <li key={s.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: color }}>
                {ICON[s.status] ?? ICON.pending}
              </span>
              {!last && <span className="w-px flex-1 min-h-4" style={{ background: s.status === 'done' ? COLOR.done : 'var(--color-border1)' }} />}
            </div>
            <div className="pb-3 min-w-0">
              <p className="text-xs font-semibold text-text-primary">
                {t(`progress.stages.${s.key}`, { defaultValue: s.label ?? s.key })}
              </p>
              <p className="text-[10px] text-text-muted">
                {t(`progress.stageStatus.${s.status}`, { defaultValue: s.status })}
                {s.at ? ` · ${dayjs(s.at).format('DD/MM/YYYY HH:mm')}` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
