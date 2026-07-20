import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, LayoutList } from 'lucide-react';
import type { DailyOverviewBacklogDesigner, DailyOverviewRow } from 'shared';
import { WorkshopConfigCategory } from 'shared';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Hint } from '@/components/common/Hint';
import { OrderListDialog } from '@/components/orders/OrderListDialog';
import { TooltipProvider } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

type RangeDays = 7 | 14 | 30;
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface Data {
  days: string[];
  rows: DailyOverviewRow[];
  backlogByDesigner: DailyOverviewBacklogDesigner[];
  unassignedBacklog: number;
  columnTotals: { total: number; ok: number; unreviewed: number; error: number; backlog: number };
}

const EMPTY: Data = {
  days: [],
  rows: [],
  backlogByDesigner: [],
  unassignedBacklog: 0,
  columnTotals: { total: 0, ok: 0, unreviewed: 0, error: 0, backlog: 0 },
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

  const noteName = (code: string) => resolve(WorkshopConfigCategory.ToolResultNote, code)?.name || code;

  const backlogGrand = useMemo(
    () => backlogByDesigner.reduce((s, d) => s + d.total, 0) + unassignedBacklog,
    [backlogByDesigner, unassignedBacklog],
  );

  // Drill-down: bấm 1 con số → mở modal danh sách đơn khớp filter.
  const [drill, setDrill] = useState<{ title: React.ReactNode; query: string } | null>(null);

  // Union mọi note lỗi trong khoảng (cho cột "Tổng" của dòng lỗi / tồn).
  const allErrorCodes = useMemo(
    () => [...new Set(rows.flatMap((r) => r.errorByNote.map((n) => n.code)))],
    [rows],
  );

  const rangeFromTo = useMemo(
    () => (days.length ? { from: days[0], to: days[days.length - 1] } : { from, to }),
    [days, from, to],
  );

  // Base query dùng chung: date range (lọc theo inProductionAt) + type/customer +
  // sort=grouped để bảng gom nhóm giống OrderFactoryTab.
  const baseParams = (fromDay?: string, toDay?: string) => {
    const sp = new URLSearchParams();
    if (fromDay) sp.set('createdFrom', fromDay);
    if (toDay) sp.set('createdTo', toDay);
    if (type) sp.set('type', type);
    if (customer) sp.set('userSku', customer);
    sp.set('sort', 'grouped');
    return sp;
  };

  type Metric = 'total' | 'ok' | 'unreviewed' | 'error' | 'backlog';
  const METRIC_LABEL: Record<Metric, string> = {
    total: 'Tổng đơn',
    ok: 'Tổng xong',
    unreviewed: 'Chưa soát',
    error: 'Tổng lỗi',
    backlog: 'Tổng tồn',
  };

  /** Mở modal cho 1 ô metric. `errorCodes` = danh sách note lỗi của phạm vi đó
   *  (1 ngày → row.errorByNote; cột Tổng → allErrorCodes). */
  const openMetric = (metric: Metric, fromDay: string, toDay: string, errorCodes: string[], dayLabel?: string) => {
    const sp = baseParams(fromDay, toDay);
    if (metric === 'ok') sp.set('toolResultNote', 'ok');
    else if (metric === 'unreviewed') sp.set('toolResultNote', '__none__');
    else if (metric === 'error') sp.set('toolResultNote', errorCodes.join(','));
    else if (metric === 'backlog') sp.set('toolResultNote', ['__none__', ...errorCodes].join(','));
    setDrill({
      title: (
        <>
          {METRIC_LABEL[metric]}
          {dayLabel ? ` · ${dayLabel}` : ' · cả kỳ'}
        </>
      ),
      query: sp.toString(),
    });
  };

  const openDesigner = (
    userId: string,
    fullName: string,
    statuses: string[],
    statusLabel: string,
  ) => {
    const sp = baseParams(rangeFromTo.from, rangeFromTo.to);
    sp.set('assignee', userId);
    sp.set('designerStatus', statuses.join(','));
    setDrill({
      title: (
        <>
          {fullName} · {statusLabel}
        </>
      ),
      query: sp.toString(),
    });
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-3 border-b border-border flex-wrap">
          <div className="flex items-center gap-2">
            <LayoutList size={16} className="text-indigo-600" />
            <span className="text-sm font-semibold">Tổng quan {nDays} ngày</span>
            <span className="hidden sm:inline text-[11px] text-muted-foreground">— theo ngày vào sản xuất</span>
          </div>
        </div>

        {!loading && days.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">Không có đơn trong khoảng đã chọn.</p>
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
                  onCell={(i) => openMetric('total', days[i], days[i], [], fmtHead(days[i]).dm)}
                  onTotal={() => openMetric('total', rangeFromTo.from ?? '', rangeFromTo.to ?? '', [])}
                />
                {/* 1b. Tổng xong (Note Tool = ok) */}
                <MetricRow
                  label="Tổng xong"
                  hint="Đơn có Note kết quả Tool = 'ok' (đã soát xong, không lỗi)"
                  values={rows.map((r) => r.ok)}
                  total={columnTotals.ok}
                  className="text-emerald-600 dark:text-emerald-400"
                  onCell={(i) => openMetric('ok', days[i], days[i], [], fmtHead(days[i]).dm)}
                  onTotal={() => openMetric('ok', rangeFromTo.from ?? '', rangeFromTo.to ?? '', [])}
                />
                {/* 2. Chưa soát */}
                <MetricRow
                  label="Chưa soát"
                  hint="Đơn có Note kết quả Tool còn trống (chưa soát)"
                  values={rows.map((r) => r.unreviewed)}
                  total={columnTotals.unreviewed}
                  className="text-slate-600 dark:text-slate-300"
                  onCell={(i) => openMetric('unreviewed', days[i], days[i], [], fmtHead(days[i]).dm)}
                  onTotal={() => openMetric('unreviewed', rangeFromTo.from ?? '', rangeFromTo.to ?? '', [])}
                />
                {/* 3. Tổng lỗi */}
                <tr className="group">
                  <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium text-rose-600">
                    Tổng lỗi
                    <div className="text-[10px] text-muted-foreground font-normal">Note Tool ≠ ok</div>
                  </td>
                  {rows.map((r, i) => {
                    const codes = r.errorByNote.map((n) => n.code);
                    const open = () => openMetric('error', days[i], days[i], codes, fmtHead(days[i]).dm);
                    return (
                      <td key={days[i]} className="border-b border-l border-border/60 text-center px-1 py-1.5">
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
                            <button
                              type="button"
                              onClick={open}
                              className="font-semibold text-rose-600 rounded px-1 -mx-1 hover:bg-rose-500/10 cursor-pointer"
                            >
                              {r.error}
                            </button>
                          </Hint>
                        ) : (
                          <NumCell value={r.error} onClick={open} className="text-rose-600" />
                        )}
                      </td>
                    );
                  })}
                  <td className="bg-muted/30 border-b border-l border-border text-center px-2 py-1.5">
                    <NumCell
                      value={columnTotals.error}
                      onClick={() => openMetric('error', rangeFromTo.from ?? '', rangeFromTo.to ?? '', allErrorCodes)}
                      className="font-semibold text-rose-600"
                    />
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
                      chưa 'ok' = chưa soát + lỗi · bấm để xem theo designer
                    </div>
                  </td>
                  {rows.map((r, i) => {
                    const codes = r.errorByNote.map((n) => n.code);
                    return (
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
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openMetric('backlog', days[i], days[i], codes, fmtHead(days[i]).dm);
                            }}
                            className="font-semibold text-amber-600 rounded px-1 -mx-1 hover:bg-amber-500/15 cursor-pointer"
                          >
                            {r.backlog}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="bg-muted/30 border-b border-l border-border text-center px-2 py-1.5">
                    {columnTotals.backlog ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openMetric('backlog', rangeFromTo.from ?? '', rangeFromTo.to ?? '', allErrorCodes);
                        }}
                        className="font-semibold text-amber-600 rounded px-1 -mx-1 hover:bg-amber-500/15 cursor-pointer"
                      >
                        {columnTotals.backlog}
                      </button>
                    ) : (
                      <span className="text-muted-foreground/40">·</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Bảng con: tồn theo designer */}
        {expanded && (
          <div className="border-t border-border bg-muted/10 p-3">
            <div className="mb-2 space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">
                Tổng tồn {columnTotals.backlog} = Chưa soát{' '}
                <span className="text-slate-600 dark:text-slate-300 font-semibold">{columnTotals.unreviewed}</span> +
                Lỗi <span className="text-rose-600 font-semibold">{columnTotals.error}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Bảng dưới: tồn theo trạng thái designer (đơn đã gán) — lăng kính khác, tổng {backlogGrand}, có thể lệch
                với Tổng tồn (không tính đơn chưa soát/chưa gán theo Tool).
              </div>
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
                      <th className="text-center font-semibold px-2 py-1.5">Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backlogByDesigner.map((d) => (
                      <tr key={d.userId} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-3 py-1.5">
                          <div className="font-medium truncate max-w-[220px]">{d.fullName}</div>
                          {d.email && <div className="text-[10px] text-muted-foreground">{d.email}</div>}
                        </td>
                        <BLCell
                          value={d.assigned}
                          className="text-zinc-700 dark:text-zinc-200"
                          onClick={() => openDesigner(d.userId, d.fullName, ['assigned'], 'Cần làm')}
                        />
                        <BLCell
                          value={d.inProgress}
                          className="text-indigo-600"
                          onClick={() => openDesigner(d.userId, d.fullName, ['in-progress'], 'Đang làm')}
                        />
                        <BLCell
                          value={d.rework}
                          className="text-amber-600"
                          onClick={() => openDesigner(d.userId, d.fullName, ['rework'], 'Làm lại')}
                        />
                        <td className="text-center px-2 py-1.5">
                          <NumCell
                            value={d.total}
                            className="font-semibold"
                            onClick={() =>
                              openDesigner(d.userId, d.fullName, ['assigned', 'in-progress', 'rework'], 'Tổng tồn')
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {unassignedBacklog > 0 && (
                      <tr className="border-b border-border/50 bg-slate-500/[0.06]">
                        <td className="px-3 py-1.5 font-medium text-slate-600 dark:text-slate-300">
                          Chưa gán
                          <span className="text-[10px] text-muted-foreground font-normal"> (chưa có designer)</span>
                        </td>
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

      <OrderListDialog
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title}
        query={drill?.query ?? null}
      />
    </TooltipProvider>
  );
}

/** Con số bấm được — mở drill-down khi v>0 & có onClick, ngược lại chỉ hiển thị. */
function NumCell({ value, onClick, className }: { value: number; onClick?: () => void; className?: string }) {
  if (value === 0) return <span className="text-muted-foreground/30">·</span>;
  if (!onClick) return <span className={cn('font-semibold', className)}>{value}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'font-semibold rounded px-1 -mx-1 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer',
        className,
      )}
    >
      {value}
    </button>
  );
}

function MetricRow({
  label,
  hint,
  values,
  total,
  className,
  onCell,
  onTotal,
}: {
  label: string;
  hint?: string;
  values: number[];
  total: number;
  className?: string;
  onCell?: (i: number) => void;
  onTotal?: () => void;
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
        <td key={i} className={cn('border-b border-l border-border/60 text-center px-1 py-1.5', className)}>
          <NumCell value={v} onClick={onCell ? () => onCell(i) : undefined} />
        </td>
      ))}
      <td className={cn('bg-muted/30 border-b border-l border-border text-center px-2 py-1.5', className)}>
        <NumCell value={total} onClick={onTotal} className="font-semibold" />
      </td>
    </tr>
  );
}

function BLHead({ label, className }: { label: string; className?: string }) {
  return <th className={cn('text-center font-medium px-2 py-1.5', className)}>{label}</th>;
}

function BLCell({ value, className, onClick }: { value: number; className?: string; onClick?: () => void }) {
  return (
    <td className="text-center px-2 py-1.5">
      <NumCell value={value} className={className} onClick={onClick} />
    </td>
  );
}
