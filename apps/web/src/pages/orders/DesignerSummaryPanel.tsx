import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Trophy, Users } from 'lucide-react';
import type { DesignerBreakdownRow, DesignerStatusCounts } from 'shared';

import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

interface Props {
  /** Query string của filter list hiện tại (đã build sẵn — không có `?` đầu). */
  filterQs: string;
  /** Callback FE khi user click cell trong matrix → set filter list. Token
   * `__unassigned_notool__` = "Chưa gán · không tool" (KPI strip click). */
  onClickCell?: (
    userId: string | null,
    designerStatus:
      | 'assigned'
      | 'in-progress'
      | 'done'
      | 'rejected'
      | 'rework'
      | 'unassigned'
      | '__unassigned_notool__'
      | '__unassigned_tool__'
      | null,
  ) => void;
}

type Breakdown = {
  scoped: DesignerStatusCounts;
  overall: DesignerStatusCounts;
  perDesigner: DesignerBreakdownRow[];
};

const STATUS_COLS: {
  key: keyof Omit<DesignerStatusCounts, 'total'>;
  label: string;
  cls: string;
  filterValue:
    | 'assigned'
    | 'in-progress'
    | 'done'
    | 'rejected'
    | 'rework'
    | 'unassigned'
    | '__unassigned_notool__';
}[] = [
    // "Chưa gán" panel = "Chưa gán không tool" (count `unassigned` từ BE đã = M);
    // filterValue token để click (KPI strip + matrix) lọc đúng nhóm không-tool.
    { key: 'unassigned', label: 'Chưa gán không tool', cls: 'text-zinc-500', filterValue: '__unassigned_notool__' },
    { key: 'assigned', label: 'Cần làm', cls: 'text-zinc-700 dark:text-zinc-200', filterValue: 'assigned' },
    { key: 'rework', label: 'Cần làm lại', cls: 'text-amber-600 dark:text-amber-400', filterValue: 'rework' },
    { key: 'inProgress', label: 'Đang làm', cls: 'text-indigo-600 dark:text-indigo-400', filterValue: 'in-progress' },
    { key: 'done', label: 'Đã xong', cls: 'text-emerald-600 dark:text-emerald-400', filterValue: 'done' },
    { key: 'rejected', label: 'Không làm được', cls: 'text-rose-600 dark:text-rose-400', filterValue: 'rejected' },
  ];

// KPI strip = "Tổng chưa gán" (N+M, `unassignedAll`) đứng TRƯỚC "Chưa gán không
// tool" (M), rồi các status khác. Matrix KHÔNG có card tổng (chỉ STATUS_COLS).
// Click "Tổng chưa gán" → filterValue 'unassigned' = list chưa gán & note≠'ok' (N+M).
const KPI_COLS: typeof STATUS_COLS = [
  { key: 'unassignedAll', label: 'Tổng chưa gán', cls: 'text-zinc-600 dark:text-zinc-300', filterValue: 'unassigned' },
  ...STATUS_COLS,
];

export function DesignerSummaryPanel({ filterQs, onClickCell }: Props) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(true);
  const [showOverall, setShowOverall] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const qs = filterQs ? `?${filterQs}` : '';
        const res = await RepositoryRemote.order.getDesignerBreakdown(qs);
        setData((res.data?.data || null) as Breakdown | null);
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [filterQs]);

  const counts = showOverall ? data?.overall : data?.scoped;
  const overallCounts = data?.overall;

  // Sort designer rows desc total + đẩy "Chưa gán" lên đầu nếu có.
  const sortedRows = useMemo(() => {
    if (!data) return [];
    const rows = [...data.perDesigner];
    rows.sort((a, b) => {
      if (a.userId === '__unassigned__') return -1;
      if (b.userId === '__unassigned__') return 1;
      return b.counts.total - a.counts.total;
    });
    return rows;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="rounded-md border border-border bg-card p-4">
        <Spinner size={16} />
      </div>
    );
  }
  if (!data || !counts) return null;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {/* KPI strip */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Trophy size={13} className="text-amber-500" />
          Designer summary
          <span className="text-muted-foreground font-normal">
            ({showOverall ? 'tổng toàn bộ' : 'theo filter'})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowOverall((s) => !s)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Xem {showOverall ? 'theo filter' : 'tổng'}
          </button>
          <button
            type="button"
            onClick={() => setShowTable((s) => !s)}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {showTable ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Bảng theo người
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 p-2.5 border-b border-border">
        {KPI_COLS.map((c) => {
          const v = counts[c.key];
          const ov = overallCounts ? overallCounts[c.key] : 0;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onClickCell?.(null, c.filterValue)}
              className={cn(
                'flex flex-col rounded-md border border-border bg-background p-2 text-left hover:border-primary hover:bg-primary/5 transition-colors',
              )}
              title={`Click để filter list theo ${c.label}`}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {c.label}
              </span>
              <span className={cn('text-lg font-bold leading-none mt-1', c.cls)}>{v}</span>
              {!showOverall && overallCounts && ov !== v && (
                <span className="text-[10px] text-muted-foreground mt-0.5">/ {ov} tổng</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Matrix */}
      {showTable && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left py-1.5 px-3 font-medium">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Users size={11} /> Designer ({sortedRows.length})
                  </span>
                </th>
                {STATUS_COLS.map((c) => (
                  <th
                    key={c.key}
                    className={cn('text-center py-1.5 px-2 font-medium', c.cls)}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="text-center py-1.5 px-2 font-semibold">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={STATUS_COLS.length + 2} className="text-center py-4 text-muted-foreground">
                    Không có designer.
                  </td>
                </tr>
              )}
              {sortedRows.map((row) => {
                const isUnassigned = row.userId === '__unassigned__';
                return (
                  <tr key={row.userId} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="py-1.5 px-3">
                      <button
                        type="button"
                        onClick={() => onClickCell?.(isUnassigned ? '__none__' : row.userId, null)}
                        className={cn(
                          'font-medium text-foreground hover:text-primary text-left flex gap-2',
                          isUnassigned && 'italic text-muted-foreground',
                        )}
                        title="Click filter theo người này"
                      >
                        <div>{row.fullName}</div>
                        {row.email && (
                          <div className="text-[10px] text-muted-foreground">- {row.email}</div>
                        )}
                      </button>
                    </td>
                    {STATUS_COLS.map((c) => {
                      const v = row.counts[c.key];
                      return (
                        <td key={c.key} className="text-center py-1 px-1">
                          {v > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                onClickCell?.(
                                  isUnassigned ? '__none__' : row.userId,
                                  c.filterValue,
                                )
                              }
                              className={cn(
                                'inline-block min-w-7 px-1.5 py-0.5 rounded text-[11px] font-medium hover:ring-1 hover:ring-primary',
                                c.cls,
                                'bg-muted/40',
                              )}
                              title={`Filter: ${row.fullName} · ${c.label}`}
                            >
                              {v}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center py-1 px-2 font-bold">{row.counts.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
