import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, List, Package, Palette, Timer, Zap } from 'lucide-react';
import type { TeamDailyRow } from 'shared';

import { RepositoryRemote } from '@/services';

import { Hint } from '@/components/common/Hint';
import { Spinner } from '@/components/common/Spinner';
import { TooltipProvider } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

const MEDALS = ['🥇', '🥈', '🥉'];
const AVATAR_STYLES = [
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-slate-200 text-slate-600 dark:bg-slate-600/50 dark:text-slate-200',
  'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

interface TopDesignersProps {
  from?: string;
  to?: string;
  type?: string;
  customer?: string;
  reloadToken?: number;
  /** Mở/đóng panel "Thời gian theo sản phẩm" (render bởi DesignerStatsTab). */
  onViewAll?: () => void;
  viewAllOpen?: boolean;
  /** Mở panel chi tiết theo sản phẩm của RIÊNG 1 designer. */
  onViewDesigner?: (userId: string, fullName: string) => void;
  /** Designer đang xem chi tiết (highlight nút). */
  activeDesignerId?: string;
}

/**
 * Top 3 designer theo tổng "Đã xong" (`totals.done` của team-daily-breakdown) —
 * cùng scope filter chung (from/to + sản phẩm + khách hàng) của tab Designer.
 */
type TopRow = {
  userId: string;
  fullName: string;
  done: number;
  metrics?: TeamDailyRow['metrics'];
};

export function TopDesigners({
  from,
  to,
  type,
  customer,
  reloadToken,
  onViewAll,
  viewAllOpen,
  onViewDesigner,
  activeDesignerId,
}: TopDesignersProps) {
  const { t } = useTranslation('dashboard');
  const [rows, setRows] = useState<TopRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.designer.teamDailyBreakdown({ from, to, type, customer });
        const data = res.data?.data as { rows?: TeamDailyRow[] } | undefined;
        const top = (data?.rows || [])
          .filter((r) => r.userId !== '__inactive__' && r.totals.done > 0)
          .map((r) => ({
            userId: r.userId,
            fullName: r.fullName,
            done: r.totals.done,
            metrics: r.metrics,
          }))
          .sort((a, b) => b.done - a.done)
          .slice(0, 3);
        setRows(top);
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [from, to, type, customer, reloadToken]);

  const formatDuration = (mins: number): string => {
    if (mins < 60) return t('topDesigners.durationMin', { count: mins });
    return t('topDesigners.durationHourMin', { hours: Math.floor(mins / 60), mins: mins % 60 });
  };

  const max = rows[0]?.done || 1;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Palette size={16} className="text-violet-500" />
          <span className="text-sm font-bold">{t('topDesigners.title')}</span>
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className={cn(
                'ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                viewAllOpen
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <List size={12} /> {t('topDesigners.viewAll')}
            </button>
          )}
        </div>

        {loading && rows.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Spinner size={16} className="text-muted-foreground" />
          </div>
        )}
        {!loading && rows.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">{t('topDesigners.empty')}</p>
        )}

        <div className="space-y-3">
          {rows.map((r, idx) => (
            <div key={r.userId} className="flex items-center gap-2.5">
              <span className="w-5 text-center text-base leading-none">{MEDALS[idx]}</span>
              <span
                className={cn(
                  'w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold',
                  AVATAR_STYLES[idx],
                )}
              >
                {initials(r.fullName)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{r.fullName}</p>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all"
                    style={{ width: `${Math.max(4, Math.round((r.done / max) * 100))}%` }}
                  />
                </div>
                {r.metrics && (
                  <div className="mt-1 flex items-center gap-x-2.5 whitespace-nowrap text-[11px] leading-4 text-muted-foreground tabular-nums">
                    <Hint
                      forceRich
                      content={
                        <div className="text-xs">
                          <p className="mb-1 font-semibold">{t('topDesigners.productTypesTip')}</p>
                          {(r.metrics.productTypeNames || []).map((name) => (
                            <p key={name}>• {name}</p>
                          ))}
                          {r.metrics.productTypes > (r.metrics.productTypeNames?.length || 0) && (
                            <p className="mt-0.5 italic">
                              {t('topDesigners.moreTypes', {
                                count: r.metrics.productTypes - (r.metrics.productTypeNames?.length || 0),
                              })}
                            </p>
                          )}
                        </div>
                      }
                    >
                      <span className="inline-flex items-center gap-1 cursor-default">
                        <Package size={11} className="text-sky-500 shrink-0" />
                        {t('topDesigners.productTypes', { count: r.metrics.productTypes })}
                      </span>
                    </Hint>
                    <Hint forceRich content={t('topDesigners.avgResponseTip')}>
                      <span className="inline-flex items-center gap-1 cursor-default">
                        <Zap size={11} className="text-amber-500 shrink-0" />
                        {r.metrics.avgResponseMin > 0 ? formatDuration(r.metrics.avgResponseMin) : '—'}
                      </span>
                    </Hint>
                    <Hint forceRich content={t('topDesigners.avgWorkTip')}>
                      <span className="inline-flex items-center gap-1 cursor-default">
                        <Timer size={11} className="text-emerald-500 shrink-0" />
                        {r.metrics.avgWorkMin > 0 ? formatDuration(r.metrics.avgWorkMin) : '—'}
                      </span>
                    </Hint>
                  </div>
                )}
              </div>
              <span className="shrink-0 text-sm font-bold text-violet-600 dark:text-violet-400 tabular-nums whitespace-nowrap">
                {t('topDesigners.count', { count: r.done })}
              </span>
              {onViewDesigner && (
                <Hint forceRich content={t('topDesigners.viewDetail')}>
                  <button
                    type="button"
                    onClick={() => onViewDesigner(r.userId, r.fullName)}
                    className={cn(
                      'shrink-0 rounded p-1 transition-colors',
                      activeDesignerId === r.userId
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    aria-label={t('topDesigners.viewDetail')}
                  >
                    <Eye size={14} />
                  </button>
                </Hint>
              )}
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
