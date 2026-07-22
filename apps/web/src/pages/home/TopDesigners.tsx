import React, { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import type { TeamDailyRow } from 'shared';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';

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
}

/**
 * Top 3 designer theo tổng "Đã xong" (`totals.done` của team-daily-breakdown) —
 * cùng scope filter chung (from/to + sản phẩm + khách hàng) của tab Designer.
 */
export function TopDesigners({ from, to, type, customer, reloadToken }: TopDesignersProps) {
  const [rows, setRows] = useState<{ userId: string; fullName: string; done: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.designer.teamDailyBreakdown({ from, to, type, customer });
        const data = res.data?.data as { rows?: TeamDailyRow[] } | undefined;
        const top = (data?.rows || [])
          .filter((r) => r.userId !== '__inactive__' && r.totals.done > 0)
          .map((r) => ({ userId: r.userId, fullName: r.fullName, done: r.totals.done }))
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

  const max = rows[0]?.done || 1;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Palette size={16} className="text-violet-500" />
        <span className="text-sm font-bold">Top Designer</span>
      </div>

      {loading && rows.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Spinner size={16} className="text-muted-foreground" />
        </div>
      )}
      {!loading && rows.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">Chưa có thiết kế nào xong trong khoảng này.</p>
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
            </div>
            <span className="shrink-0 text-sm font-bold text-violet-600 dark:text-violet-400 tabular-nums whitespace-nowrap">
              {r.done} thiết kế
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
