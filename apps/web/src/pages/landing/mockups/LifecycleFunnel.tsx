import React from 'react';
import { useTranslation } from 'react-i18next';
import { CircleDot, Layers, PackageCheck } from 'lucide-react';

import { cn } from '@/utils/cn';

/**
 * Minh hoạ phễu tiến trình đơn hàng.
 *
 * Nhãn công đoạn CỐ Ý để ở mức tổng quát (Tiếp nhận/Thiết kế/Sản xuất/...) chứ
 * KHÔNG dùng đúng tên các công đoạn thật trong hệ thống — đây là trang public,
 * không nêu chi tiết quy trình vận hành. Mọi con số chỉ để mô tả bố cục.
 */

const STAGES: { key: string; total: number; waiting: number; doing: number; rework: number; bottleneck?: boolean }[] = [
  { key: 'intake', total: 18, waiting: 12, doing: 5, rework: 1 },
  { key: 'design', total: 34, waiting: 21, doing: 11, rework: 2 },
  { key: 'production', total: 41, waiting: 30, doing: 8, rework: 3, bottleneck: true },
  { key: 'check', total: 9, waiting: 4, doing: 4, rework: 1 },
  { key: 'finishing', total: 15, waiting: 9, doing: 6, rework: 0 },
  { key: 'pack', total: 7, waiting: 3, doing: 4, rework: 0 },
];

function LifecycleFunnel() {
  const { t } = useTranslation('landing');

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          { icon: Layers, key: 'total', value: '124', tone: 'text-[#0f110f]' },
          { icon: CircleDot, key: 'running', value: '89', tone: 'text-brand-600' },
          { icon: PackageCheck, key: 'completed', value: '35', tone: 'text-emerald-600' },
        ].map(({ icon: Icon, key, value, tone }) => (
          <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
            <span className="flex items-center gap-1 text-[0.6rem] font-medium uppercase tracking-wide text-slate-500">
              <Icon size={11} className="shrink-0" />
              {t(`mockup.metrics.${key}`)}
            </span>
            <span className={cn('mt-0.5 block text-lg font-semibold tabular-nums leading-none', tone)}>{value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {STAGES.map((stage) => (
          <div
            key={stage.key}
            className={cn(
              'rounded-lg border px-2 py-2',
              stage.bottleneck ? 'border-amber-400 bg-amber-50/70' : 'border-slate-200 bg-white',
            )}
          >
            <p className="truncate text-[0.58rem] font-medium uppercase tracking-wide text-slate-500">
              {t(`mockup.stages.${stage.key}`)}
            </p>
            <p
              className={cn(
                'mt-1 text-base font-semibold tabular-nums leading-none',
                stage.bottleneck ? 'text-amber-700' : 'text-[#0f110f]',
              )}
            >
              {stage.total}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[0.55rem] tabular-nums text-slate-500">
              <span>{stage.waiting}</span>
              <span className="text-brand-600">{stage.doing}</span>
              <span className={stage.rework > 0 ? 'text-rose-500' : ''}>{stage.rework}</span>
            </div>
            <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-slate-100">
              <span className="bg-slate-300" style={{ width: `${(stage.waiting / stage.total) * 100}%` }} />
              <span className="bg-brand-500" style={{ width: `${(stage.doing / stage.total) * 100}%` }} />
              <span className="bg-rose-400" style={{ width: `${(stage.rework / stage.total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[0.6rem] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          {t('mockup.metrics.waiting')}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          {t('mockup.metrics.inProgress')}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          {t('mockup.metrics.rework')}
        </span>
      </div>
    </div>
  );
}

export default LifecycleFunnel;
