import React, { useEffect, useRef, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import type { TeamDailyCell, TeamDailyRow } from 'shared';

import { RepositoryRemote } from '@/services';

import { Hint } from '@/components/common/Hint';
import { TooltipProvider } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

type RangeDays = 7 | 14 | 30;
const RANGES: RangeDays[] = [7, 14, 30];
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface Data {
  days: string[];
  rows: TeamDailyRow[];
  columnTotals: TeamDailyCell[];
  grandTotals: TeamDailyCell;
}

const EMPTY: Data = {
  days: [],
  rows: [],
  columnTotals: [],
  grandTotals: { assigned: 0, rework: 0, inProgress: 0, done: 0, rejected: 0, received: 0, unfinished: 0 },
};

interface Props {
  /** Bump để refetch khi tab bấm Refresh. */
  reloadToken?: number;
  /** Filter sản phẩm (`order.type`) — dùng chung toàn tab. */
  type?: string;
  /** Filter khách hàng (`order.userSku`) — dùng chung toàn tab. */
  customer?: string;
}

function fmtHead(day: string): { wd: string; dm: string } {
  const d = new Date(`${day}T12:00:00+07:00`);
  return {
    wd: WEEKDAYS[d.getDay()] ?? '',
    dm: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
  };
}

/** Nền heatmap amber theo tổng đơn chưa xong của ô. */
function tint(unfinished: number): string {
  if (unfinished <= 0) return '';
  if (unfinished <= 2) return 'bg-amber-500/[0.06]';
  if (unfinished <= 5) return 'bg-amber-500/[0.12]';
  return 'bg-amber-500/[0.22]';
}

export function TeamDailyMatrix({ reloadToken, type, customer }: Props) {
  const [range, setRange] = useState<RangeDays>(7);
  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.designer.teamDailyBreakdown({
          days: range,
          ...(type ? { type } : {}),
          ...(customer ? { customer } : {}),
        });
        if (seq !== seqRef.current) return;
        const raw = (res.data?.data as Data) || EMPTY;
        // BE trả ngày mới→cũ. Đảo thành cũ→mới để hiển thị QUÁ KHỨ → HIỆN TẠI
        // theo chiều trái → phải. Đảo đồng bộ cả cells mỗi row + columnTotals.
        setData({
          days: [...raw.days].reverse(),
          rows: raw.rows.map((r) => ({ ...r, cells: [...r.cells].reverse() })),
          columnTotals: [...raw.columnTotals].reverse(),
          grandTotals: raw.grandTotals,
        });
      } catch (err) {
        if (seq === seqRef.current) handleAxiosError(err);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, [range, reloadToken, type, customer]);

  const { days, rows, columnTotals, grandTotals } = data;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-3 border-b border-border flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarRange size={16} className="text-indigo-600" />
            <span className="text-sm font-semibold">Tất cả designer theo ngày</span>
            <span className="hidden sm:inline text-[11px] text-muted-foreground">
              — snapshot theo ngày vào sản xuất, focus đơn chưa xong
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Legend */}
            <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground">
              <Legend className="text-zinc-600 dark:text-zinc-300" label="Cần làm" />
              <Legend className="text-amber-600" label="Làm lại" />
              <Legend className="text-indigo-600" label="Đang làm" />
              <Legend className="text-emerald-600" label="Đã xong" />
              <Legend className="text-rose-600" label="Không làm được" />
              <Legend className="text-sky-600" label="+Nhận thêm" />
            </div>
            {/* Range switcher */}
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-medium transition-colors',
                    range === r ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {r} ngày
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grand summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[11px] border-b border-border bg-muted/20">
          <span className="font-semibold text-foreground">
            Chưa xong toàn team:{' '}
            <span className={grandTotals.unfinished > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
              {grandTotals.unfinished}
            </span>
          </span>
          <span className="text-muted-foreground">
            Cần làm <span className="font-semibold text-zinc-600 dark:text-zinc-300">{grandTotals.assigned}</span>
          </span>
          <span className="text-muted-foreground">
            Làm lại <span className="font-semibold text-amber-600">{grandTotals.rework}</span>
          </span>
          <span className="text-muted-foreground">
            Đang làm <span className="font-semibold text-indigo-600">{grandTotals.inProgress}</span>
          </span>
          <span className="text-muted-foreground">
            Không làm được <span className="font-semibold text-rose-600">{grandTotals.rejected}</span>
          </span>
          <span className="text-muted-foreground">
            Nhận thêm <span className="font-semibold text-sky-600">+{grandTotals.received}</span>
          </span>
          <span className="ml-auto text-muted-foreground">
            Đã xong <span className="font-semibold text-emerald-600">{grandTotals.done}</span> · Tổng đã nhận{' '}
            <span className="font-semibold text-foreground">
              {grandTotals.assigned +
                grandTotals.rework +
                grandTotals.inProgress +
                grandTotals.done +
                grandTotals.rejected}
            </span>
          </span>
        </div>

        {/* Matrix */}
        {!loading && rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">Không có đơn trong {range} ngày gần nhất.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-card text-left font-medium px-3 py-2 border-b border-border min-w-[160px]">
                    Designer
                  </th>
                  {days.map((d) => {
                    const { wd, dm } = fmtHead(d);
                    return (
                      <th
                        key={d}
                        className="bg-card font-medium px-1.5 py-1.5 border-b border-l border-border text-center min-w-[94px]"
                      >
                        <div className="text-[11px] text-muted-foreground leading-tight">{wd}</div>
                        <div className="leading-tight font-semibold">{dm}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId} className="group">
                    <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60">
                      <div className="font-medium text-foreground truncate max-w-[150px]" title={row.fullName}>
                        {row.fullName}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        đã nhận{' '}
                        <span className="font-semibold text-foreground">
                          {row.totals.assigned +
                            row.totals.rework +
                            row.totals.inProgress +
                            row.totals.done +
                            row.totals.rejected}
                        </span>{' '}
                        · chưa xong{' '}
                        <span className={row.totals.unfinished > 0 ? 'text-amber-600 font-semibold' : ''}>
                          {row.totals.unfinished}
                        </span>{' '}
                        · xong <span className="text-emerald-600">{row.totals.done}</span>
                        {row.totals.rejected > 0 && (
                          <>
                            {' '}
                            · k.làm được <span className="text-rose-600">{row.totals.rejected}</span>
                          </>
                        )}
                        {row.totals.received > 0 && (
                          <>
                            {' '}
                            · nhận <span className="text-sky-600">+{row.totals.received}</span>
                          </>
                        )}
                      </div>
                    </td>
                    {row.cells.map((c, i) => (
                      <td
                        key={days[i]}
                        title={`${days[i]} — Đã nhận ${c.assigned + c.rework + c.inProgress + c.done + c.rejected} = Cần làm ${c.assigned} + Làm lại ${c.rework} + Đang làm ${c.inProgress} + Đã xong ${c.done} + Không làm được ${c.rejected} (nhận bàn giao thêm +${c.received})`}
                        className={cn('border-b border-l border-border/60 text-center px-1 py-1.5', tint(c.unfinished))}
                      >
                        {c.assigned + c.rework + c.inProgress + c.done + c.rejected + c.received === 0 ? (
                          <span className="text-muted-foreground/30">·</span>
                        ) : (
                          <MiniCell cell={c} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 border-t-2 border-border text-foreground">
                    Tổng / ngày
                  </td>
                  {columnTotals.map((c, i) => (
                    <td key={days[i]} className="border-t-2 border-l border-border text-center px-1 py-1.5">
                      {c.assigned + c.rework + c.inProgress + c.done + c.rejected + c.received === 0 ? (
                        <span className="text-muted-foreground/40">·</span>
                      ) : (
                        <MiniCell cell={c} />
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
          Mỗi ô: <span className="text-zinc-600 dark:text-zinc-300">Cần làm</span>·
          <span className="text-amber-600">Làm lại</span>·<span className="text-indigo-600">Đang làm</span>·
          <span className="text-emerald-600">Đã xong</span>·<span className="text-rose-600">Không làm được</span>{' '}
          (đơn vào sản xuất ngày đó) — <b>Tổng đã nhận = 5 số cộng lại</b>;{' '}
          <span className="text-sky-600">+N</span> = số lần nhận bàn giao thêm (đã nằm trong 5 số, không cộng riêng). Nền
          càng đậm = càng nhiều đơn chưa xong. Đơn vào SX ngoài {range} ngày sẽ ẩn — chọn 14/30 để mở rộng.
        </p>
      </div>
    </TooltipProvider>
  );
}

function MiniCell({ cell }: { cell: TeamDailyCell }) {
  const receivedTotal = cell.assigned + cell.rework + cell.inProgress + cell.done + cell.rejected;
  return (
    <span className="inline-flex items-center justify-center gap-1 leading-none text-[13px]">
      <Num value={cell.assigned} label="Cần làm" className="text-zinc-700 dark:text-zinc-200" />
      <Sep />
      <Num value={cell.rework} label="Cần làm lại" className="text-amber-600" />
      <Sep />
      <Num value={cell.inProgress} label="Đang làm" className="text-indigo-600" />
      <Sep />
      <Num value={cell.done} label="Đã xong" className="text-emerald-600" />
      <Sep />
      {/* <Num
        value={cell.rejected}
        label={`Không làm được (bàn giao đi) — Đã nhận = 5 số cộng lại = ${receivedTotal}`}
        className="text-rose-600"
      />
      {cell.received > 0 && (
        <Hint content={`Nhận bàn giao thêm: ${cell.received} (đã tính trong các số kia — không cộng riêng)`} forceRich>
          <span className="cursor-help font-semibold text-sky-600">+{cell.received}</span>
        </Hint>
      )} */}
    </span>
  );
}

function Num({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <Hint content={`${label}: ${value}`} forceRich>
      <span className={cn('cursor-help', value > 0 ? cn('font-semibold', className) : 'text-muted-foreground/30')}>
        {value}
      </span>
    </Hint>
  );
}

function Sep() {
  return <span className="text-muted-foreground/30">·</span>;
}

function Legend({ label, className }: { label: string; className?: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('font-bold', className)}>•</span>
      {label}
    </span>
  );
}
