import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import type { DesignerDailyBreakdownDay } from 'shared';

import { RepositoryRemote } from '@/services';

import { Hint } from '@/components/common/Hint';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

type RangeDays = 7 | 14 | 30;
const RANGES: RangeDays[] = [7, 14, 30];

interface Totals {
  assigned: number;
  rework: number;
  inProgress: number;
  done: number;
  unfinished: number;
}

interface Props {
  /** Ngày (YYYY-MM-DD) kanban đang lọc (from===to) — highlight row tương ứng. */
  selectedDay?: string;
  /** Click 1 ngày → lọc kanban về đúng ngày đó (set from=to=day). */
  onPickDay: (day: string) => void;
  /** Bump để panel refetch sau khi có transition (đồng bộ với kanban). */
  reloadToken?: number;
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** 'YYYY-MM-DD' → { wd: 'T4', dm: '01/07' } (đọc theo giờ VN). */
function fmtDay(day: string): { wd: string; dm: string } {
  const d = new Date(`${day}T12:00:00+07:00`);
  return {
    wd: WEEKDAYS[d.getDay()] ?? '',
    dm: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
  };
}

function ageLabel(ageDays: number): string {
  if (ageDays <= 0) return 'Hôm nay';
  if (ageDays === 1) return 'Hôm qua';
  return `${ageDays} ngày trước`;
}

export function DailyBreakdownPanel({ selectedDay, onPickDay, reloadToken }: Props) {
  const [open, setOpen] = useState(true);
  const [range, setRange] = useState<RangeDays>(7);
  const [days, setDays] = useState<DesignerDailyBreakdownDay[]>([]);
  const [totals, setTotals] = useState<Totals>({
    assigned: 0,
    rework: 0,
    inProgress: 0,
    done: 0,
    unfinished: 0,
  });
  const [loading, setLoading] = useState(false);

  // Seq guard: đổi range liên tiếp → response cũ về muộn không ghi đè data mới.
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.designer.myDailyBreakdown({ days: range });
        if (seq !== seqRef.current) return;
        const data = res.data?.data as { days: DesignerDailyBreakdownDay[]; totals: Totals } | undefined;
        setDays(data?.days || []);
        setTotals(data?.totals || { assigned: 0, rework: 0, inProgress: 0, done: 0, unfinished: 0 });
      } catch (err) {
        if (seq === seqRef.current) handleAxiosError(err);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, [range, reloadToken]);

  // Số ngày còn tồn đơn chưa xong (để hiện cảnh báo ở header khi panel gập).
  const daysWithBacklog = useMemo(() => days.filter((d) => d.unfinished > 0).length, [days]);

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-2.5">
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="flex items-center gap-2 text-xs font-semibold text-foreground hover:text-primary"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <CalendarDays size={14} className="text-indigo-600" />
          <span>Chi tiết theo ngày</span>
          {totals.unfinished > 0 && (
            <span className="ml-1 rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              {totals.unfinished} chưa xong · {daysWithBacklog} ngày
            </span>
          )}
        </button>

        {/* Range switcher 7/14/30 */}
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium transition-colors',
                range === r ? 'bg-indigo-600 text-white' : 'bg-transparent text-muted-foreground hover:bg-muted',
              )}
            >
              {r} ngày
            </button>
          ))}
        </div>
      </div>

      {open && (
        <div className="border-t border-border">
          {/* Summary strip — focus vào đơn chưa xong */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[11px] border-b border-border bg-muted/20">
            <span className="font-semibold text-foreground">
              Chưa xong:{' '}
              <span className={totals.unfinished > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                {totals.unfinished}
              </span>
            </span>
            <SummaryChip label="Cần làm" value={totals.assigned} className="text-zinc-600 dark:text-zinc-300" />
            <SummaryChip label="Cần làm lại" value={totals.rework} className="text-amber-600" />
            <SummaryChip label="Đang làm" value={totals.inProgress} className="text-indigo-600" />
            <span className="ml-auto text-muted-foreground">
              Đã xong: <span className="font-semibold text-emerald-600">{totals.done}</span>
            </span>
          </div>

          {/* Table */}
          <div className="max-h-[280px] overflow-y-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left font-medium px-3 py-1.5">Ngày</th>
                  <Th>Cần làm</Th>
                  <Th>Cần làm lại</Th>
                  <Th>Đang làm</Th>
                  <Th className="border-l border-border">Đã xong</Th>
                </tr>
              </thead>
              <tbody>
                {loading && days.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground italic">
                      Đang tải…
                    </td>
                  </tr>
                )}
                {!loading && days.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground italic">
                      Không có đơn trong {range} ngày gần nhất.
                    </td>
                  </tr>
                )}
                {days.map((d) => {
                  const isSelected = selectedDay === d.day;
                  // Tô nền theo mức "tồn": có đơn chưa xong + càng cũ càng đậm.
                  const backlogTint =
                    d.unfinished === 0
                      ? ''
                      : d.ageDays >= 3
                        ? 'bg-amber-50/70 dark:bg-amber-500/[0.07]'
                        : 'bg-amber-50/40 dark:bg-amber-500/[0.04]';
                  const { wd, dm } = fmtDay(d.day);
                  return (
                    <tr
                      key={d.day}
                      role="button"
                      tabIndex={0}
                      onClick={() => onPickDay(d.day)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onPickDay(d.day);
                        }
                      }}
                      title="Click để lọc kanban theo ngày này"
                      className={cn(
                        'group border-b border-border/60 cursor-pointer transition-colors hover:bg-muted/60',
                        backlogTint,
                        isSelected && 'ring-1 ring-inset ring-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10',
                      )}
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {d.unfinished > 0 && d.ageDays >= 3 ? (
                            <Hint content={`Đơn tồn ${ageLabel(d.ageDays).toLowerCase()} chưa làm xong`}>
                              <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                            </Hint>
                          ) : (
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                d.unfinished > 0 ? 'bg-amber-400' : 'bg-muted-foreground/30',
                              )}
                            />
                          )}
                          <Hint content={ageLabel(d.ageDays)}>
                            <span className="font-medium text-foreground">
                              {wd} <span className="text-muted-foreground">{dm}</span>
                            </span>
                          </Hint>
                          <Filter
                            size={10}
                            className="text-muted-foreground/0 group-hover:text-muted-foreground shrink-0"
                          />
                        </div>
                      </td>
                      <Cell value={d.assigned} className="text-zinc-700 dark:text-zinc-200" />
                      <Cell value={d.rework} className="text-amber-600" strong />
                      <Cell value={d.inProgress} className="text-indigo-600" strong />
                      <td className="px-2 py-1.5 text-center border-l border-border">
                        <span className={d.done > 0 ? 'text-emerald-600' : 'text-muted-foreground/40'}>
                          {d.done || '–'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {days.length > 0 && (
                <tfoot className="sticky bottom-0 bg-card">
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-3 py-1.5 text-foreground">Tổng</td>
                    <Cell value={totals.assigned} className="text-zinc-700 dark:text-zinc-200" strong />
                    <Cell value={totals.rework} className="text-amber-600" strong />
                    <Cell value={totals.inProgress} className="text-indigo-600" strong />
                    <td className="px-2 py-1.5 text-center border-l border-border text-emerald-600">{totals.done}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('font-medium px-2 py-1.5 text-center', className)}>{children}</th>;
}

function Cell({ value, className, strong }: { value: number; className?: string; strong?: boolean }) {
  return (
    <td className="px-2 py-1.5 text-center">
      {value > 0 ? (
        <span className={cn(strong && 'font-semibold', className)}>{value}</span>
      ) : (
        <span className="text-muted-foreground/40">–</span>
      )}
    </td>
  );
}

function SummaryChip({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <span className="text-muted-foreground">
      {label}: <span className={cn('font-semibold', className)}>{value}</span>
    </span>
  );
}
