import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, LayoutList } from 'lucide-react';
import { WorkshopConfigCategory } from 'shared';
import type {
  DailyOverviewBacklogDesigner,
  DailyOverviewRow,
} from 'shared';

import { Hint } from '@/components/common/Hint';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

type RangeDays = 7 | 14 | 30;
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface Data {
  days: string[];
  rows: DailyOverviewRow[];
  backlogByDesigner: DailyOverviewBacklogDesigner[];
  unassignedBacklog: number;
  columnTotals: { total: number; unreviewed: number; error: number; backlog: number };
}

const EMPTY: Data = {
  days: [],
  rows: [],
  backlogByDesigner: [],
  unassignedBacklog: 0,
  columnTotals: { total: 0, unreviewed: 0, error: 0, backlog: 0 },
};

interface Props {
  /** Số ngày (7/14/30) — điều khiển từ switcher ở Bộ lọc chung. */
  days?: RangeDays;
  /** Khoảng tùy biến (YYYY-MM-DD) — nếu có cả 2 thì override `days`. */
  from?: string;
  to?: string;
  /** Bump để refetch khi tab bấm Refresh. */
  reloadToken?: number;
  /** Filter chung sản phẩm (`order.type`). */
  type?: string;
  /** Filter chung khách hàng (`order.userSku`). */
  customer?: string;
}

function fmtHead(day: string): { wd: string; dm: string } {
  const d = new Date(`${day}T12:00:00+07:00`);
  return {
    wd: WEEKDAYS[d.getDay()] ?? '',
    dm: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
  };
}

export function DesignerDailyOverview({ days: range = 7, from, to, reloadToken, type, customer }: Props) {
  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const seqRef = useRef(0);

  const resolve = useWorkshopConfigStore((s) => s.resolve);
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  useEffect(() => {
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.designer.dailyOverview({
          days: range,
          ...(from && to ? { from, to } : {}),
          ...(type ? { type } : {}),
          ...(customer ? { customer } : {}),
        });
        if (seq !== seqRef.current) return;
        const raw = (res.data?.data as Data) || EMPTY;
        // BE trả ngày mới→cũ. Đảo cả days + rows để hiển thị quá khứ→hiện tại.
        setData({
          ...raw,
          days: [...raw.days].reverse(),
          rows: [...raw.rows].reverse(),
        });
      } catch (err) {
        if (seq === seqRef.current) handleAxiosError(err);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, [range, from, to, reloadToken, type, customer]);

  const { days, rows, backlogByDesigner, unassignedBacklog, columnTotals } = data;
  const nDays = days.length || range;

  const noteName = (code: string) =>
    resolve(WorkshopConfigCategory.ToolResultNote, code)?.name || code;

  const backlogGrand = useMemo(
    () => backlogByDesigner.reduce((s, d) => s + d.total, 0) + unassignedBacklog,
    [backlogByDesigner, unassignedBacklog],
  );

  return (
    <TooltipProvider delayDuration={100}>
      <div className="rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-3 border-b border-border flex-wrap">
          <div className="flex items-center gap-2">
            <LayoutList size={16} className="text-indigo-600" />
            <span className="text-sm font-semibold">Tổng quan {nDays} ngày</span>
            <span className="hidden sm:inline text-[11px] text-muted-foreground">
              — theo ngày vào sản xuất
            </span>
          </div>
        </div>

        {!loading && days.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            Không có đơn trong khoảng đã chọn.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-card text-left font-medium px-3 py-2 border-b border-border min-w-[150px]">
                    Chỉ số
                  </th>
                  {days.map((d) => {
                    const { wd, dm } = fmtHead(d);
                    return (
                      <th
                        key={d}
                        className="bg-card font-medium px-1.5 py-1.5 border-b border-l border-border text-center min-w-[64px]"
                      >
                        <div className="text-[11px] text-muted-foreground leading-tight">{wd}</div>
                        <div className="leading-tight font-semibold">{dm}</div>
                      </th>
                    );
                  })}
                  <th className="bg-muted/30 font-semibold px-2 py-1.5 border-b border-l border-border text-center min-w-[64px]">
                    Tổng
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 1. Tổng đơn */}
                <MetricRow
                  label="Tổng đơn"
                  values={rows.map((r) => r.total)}
                  total={columnTotals.total}
                />
                {/* 2. Chưa soát */}
                <MetricRow
                  label="Chưa soát"
                  hint="Đơn có Note kết quả Tool còn trống (chưa soát)"
                  values={rows.map((r) => r.unreviewed)}
                  total={columnTotals.unreviewed}
                  className="text-slate-600 dark:text-slate-300"
                />
                {/* 3. Tổng lỗi */}
                <tr className="group">
                  <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium text-rose-600">
                    Tổng lỗi
                    <div className="text-[10px] text-muted-foreground font-normal">Note Tool ≠ ok</div>
                  </td>
                  {rows.map((r, i) => (
                    <td
                      key={days[i]}
                      className="border-b border-l border-border/60 text-center px-1 py-1.5"
                    >
                      {r.error === 0 ? (
                        <span className="text-muted-foreground/30">·</span>
                      ) : r.errorByNote.length > 0 ? (
                        <Hint
                          forceRich
                          content={
                            <div className="text-left">
                              {r.errorByNote.map((n) => (
                                <div key={n.code} className="flex justify-between gap-3">
                                  <span>{noteName(n.code)}</span>
                                  <span className="tabular-nums font-semibold">{n.count}</span>
                                </div>
                              ))}
                            </div>
                          }
                        >
                          <span className="cursor-help font-semibold text-rose-600">{r.error}</span>
                        </Hint>
                      ) : (
                        <span className="font-semibold text-rose-600">{r.error}</span>
                      )}
                    </td>
                  ))}
                  <td className="bg-muted/30 border-b border-l border-border text-center px-2 py-1.5 font-semibold text-rose-600">
                    {columnTotals.error || <span className="text-muted-foreground/40">·</span>}
                  </td>
                </tr>
                {/* 4. Tổng tồn (click để xổ) */}
                <tr className="group cursor-pointer" onClick={() => setExpanded((v) => !v)}>
                  <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium text-amber-600">
                    <span className="inline-flex items-center gap-1">
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      Tổng tồn
                    </span>
                    <div className="text-[10px] text-muted-foreground font-normal pl-[18px]">
                      chưa xong · bấm để xem theo designer
                    </div>
                  </td>
                  {rows.map((r, i) => (
                    <td
                      key={days[i]}
                      className={cn(
                        'border-b border-l border-border/60 text-center px-1 py-1.5',
                        r.backlog > 0 ? 'bg-amber-500/[0.07]' : '',
                      )}
                    >
                      {r.backlog === 0 ? (
                        <span className="text-muted-foreground/30">·</span>
                      ) : (
                        <span className="font-semibold text-amber-600">{r.backlog}</span>
                      )}
                    </td>
                  ))}
                  <td className="bg-muted/30 border-b border-l border-border text-center px-2 py-1.5 font-semibold text-amber-600">
                    {columnTotals.backlog || <span className="text-muted-foreground/40">·</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Bảng con: tồn theo designer */}
        {expanded && (
          <div className="border-t border-border bg-muted/10 p-3">
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">
              Tồn theo designer ({nDays} ngày) — tổng {backlogGrand}
            </div>
            {backlogByDesigner.length === 0 && unassignedBacklog === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Không có đơn tồn.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="text-[11px] text-muted-foreground border-b border-border">
                      <th className="text-left font-medium px-3 py-1.5">Designer</th>
                      <BLHead label="Cần làm" className="text-zinc-600 dark:text-zinc-300" />
                      <BLHead label="Đang làm" className="text-indigo-600" />
                      <BLHead label="Làm lại" className="text-amber-600" />
                      <BLHead label="Trả lại" className="text-rose-500" />
                      <th className="text-center font-semibold px-2 py-1.5">Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backlogByDesigner.map((d) => (
                      <tr key={d.userId} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-3 py-1.5">
                          <div className="font-medium truncate max-w-[220px]">{d.fullName}</div>
                          {d.email && (
                            <div className="text-[10px] text-muted-foreground">{d.email}</div>
                          )}
                        </td>
                        <BLCell value={d.assigned} className="text-zinc-700 dark:text-zinc-200" />
                        <BLCell value={d.inProgress} className="text-indigo-600" />
                        <BLCell value={d.rework} className="text-amber-600" />
                        <BLCell value={d.rejected} className="text-rose-500" />
                        <td className="text-center px-2 py-1.5 font-semibold">{d.total}</td>
                      </tr>
                    ))}
                    {unassignedBacklog > 0 && (
                      <tr className="border-b border-border/50 bg-slate-500/[0.06]">
                        <td className="px-3 py-1.5 font-medium text-slate-600 dark:text-slate-300">
                          Chưa gán
                          <span className="text-[10px] text-muted-foreground font-normal">
                            {' '}
                            (chưa có designer)
                          </span>
                        </td>
                        <td className="text-center px-2 py-1.5 text-muted-foreground/40">·</td>
                        <td className="text-center px-2 py-1.5 text-muted-foreground/40">·</td>
                        <td className="text-center px-2 py-1.5 text-muted-foreground/40">·</td>
                        <td className="text-center px-2 py-1.5 text-muted-foreground/40">·</td>
                        <td className="text-center px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300">
                          {unassignedBacklog}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function MetricRow({
  label,
  hint,
  values,
  total,
  className,
}: {
  label: string;
  hint?: string;
  values: number[];
  total: number;
  className?: string;
}) {
  return (
    <tr className="group">
      <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium">
        {hint ? (
          <Hint content={hint}>
            <span className="cursor-help">{label}</span>
          </Hint>
        ) : (
          label
        )}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn('border-b border-l border-border/60 text-center px-1 py-1.5', className)}
        >
          {v === 0 ? <span className="text-muted-foreground/30">·</span> : <span className="font-semibold">{v}</span>}
        </td>
      ))}
      <td className={cn('bg-muted/30 border-b border-l border-border text-center px-2 py-1.5 font-semibold', className)}>
        {total || <span className="text-muted-foreground/40">·</span>}
      </td>
    </tr>
  );
}

function BLHead({ label, className }: { label: string; className?: string }) {
  return <th className={cn('text-center font-medium px-2 py-1.5', className)}>{label}</th>;
}

function BLCell({ value, className }: { value: number; className?: string }) {
  return (
    <td className="text-center px-2 py-1.5">
      {value > 0 ? (
        <span className={cn('font-semibold', className)}>{value}</span>
      ) : (
        <span className="text-muted-foreground/30">·</span>
      )}
    </td>
  );
}
