import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, X } from 'lucide-react';
import type { FulfillmentDailyRow, FulfillmentStage } from 'shared';

import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface Data {
  days: FulfillmentDailyRow[];
  columnTotals: { arrived: number; done: number; remaining: number; rework: number };
  rangeDays: number;
}

const EMPTY: Data = {
  days: [],
  columnTotals: { arrived: 0, done: 0, remaining: 0, rework: 0 },
  rangeDays: 0,
};

function fmtHead(day: string): { wd: string; dm: string } {
  const d = new Date(`${day}T12:00:00+07:00`);
  return {
    wd: WEEKDAYS[d.getDay()] ?? '',
    dm: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
  };
}

interface Props {
  stage: FulfillmentStage;
  /** Khoảng ngày (YYYY-MM-DD VN). Rỗng cả 2 → BE default 7 ngày. */
  from?: string;
  to?: string;
  /** Bump để refetch sau transition/refresh. */
  reloadToken?: number;
  /** Ngày đang lọc (YYYY-MM-DD) — highlight cột. */
  dayFilter?: string;
  /** Click 1 ngày (header/ô) → toggle lọc danh sách bên dưới. */
  onPickDay?: (day: string) => void;
}

/**
 * Bảng tổng quan theo ngày cho 1 stage Fulfillment — gom theo `inProductionAt`
 * (VN). 4 hàng Đến / Đã làm / Còn lại / Lỗi cần sửa (phân loại theo status hiện
 * tại của stage). Click 1 ngày → parent lọc kanban/bảng client-side theo ngày.
 */
export function FulfillmentDailyOverview({
  stage,
  from,
  to,
  reloadToken,
  dayFilter,
  onPickDay,
}: Props) {
  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.fulfillment.dailyOverview({
          stage,
          ...(from && to ? { from, to } : {}),
        });
        if (seq !== seqRef.current) return;
        const raw = (res.data?.data as Data) || EMPTY;
        // BE trả mới→cũ → reverse để hiển thị cũ→mới (trái→phải).
        setData({ ...raw, days: [...raw.days].reverse() });
      } catch (err) {
        if (seq === seqRef.current) handleAxiosError(err);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, [stage, from, to, reloadToken]);

  const { days, columnTotals } = data;
  const rows = useMemo(
    () =>
      [
        { key: 'arrived', label: 'Đến', cls: 'text-foreground', pick: (d: FulfillmentDailyRow) => d.arrived, total: columnTotals.arrived },
        { key: 'done', label: 'Đã làm', cls: 'text-emerald-600 dark:text-emerald-400', pick: (d: FulfillmentDailyRow) => d.done, total: columnTotals.done },
        { key: 'remaining', label: 'Còn lại', cls: 'text-indigo-600 dark:text-indigo-400', pick: (d: FulfillmentDailyRow) => d.remaining, total: columnTotals.remaining },
        { key: 'rework', label: 'Lỗi cần sửa', cls: 'text-amber-600', pick: (d: FulfillmentDailyRow) => d.rework, total: columnTotals.rework },
      ] as const,
    [columnTotals],
  );

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <CalendarRange size={15} className="text-indigo-600" />
        <span className="text-sm font-semibold">Tổng quan theo ngày</span>
        <span className="hidden sm:inline text-[11px] text-muted-foreground">
          — theo ngày vào sản xuất · bấm 1 ngày để lọc danh sách bên dưới
        </span>
        {dayFilter && onPickDay && (
          <button
            type="button"
            onClick={() => onPickDay(dayFilter)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-2 py-0.5"
          >
            Đang lọc {fmtHead(dayFilter).dm}
            <X size={11} />
          </button>
        )}
      </div>

      {!loading && days.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">Không có đơn trong khoảng đã chọn.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-card text-left font-medium px-3 py-2 border-b border-border min-w-[110px]">
                  Chỉ số
                </th>
                {days.map((d) => {
                  const { wd, dm } = fmtHead(d.day);
                  const active = dayFilter === d.day;
                  return (
                    <th
                      key={d.day}
                      onClick={() => onPickDay?.(d.day)}
                      className={`font-medium px-1.5 py-1.5 border-b border-l border-border text-center min-w-[56px] transition-colors ${
                        onPickDay ? 'cursor-pointer' : ''
                      } ${active ? 'bg-indigo-100 dark:bg-indigo-500/25' : 'bg-card hover:bg-muted/60'}`}
                    >
                      <div className="text-[11px] text-muted-foreground leading-tight">{wd}</div>
                      <div className="leading-tight font-semibold">{dm}</div>
                    </th>
                  );
                })}
                <th className="bg-muted/30 font-semibold px-2 py-1.5 border-b border-l border-border text-center min-w-[56px]">
                  Tổng
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="group">
                  <td className={`sticky left-0 z-10 bg-card px-3 py-1.5 border-b border-border/60 font-medium ${row.cls}`}>
                    {row.label}
                  </td>
                  {days.map((d) => {
                    const v = row.pick(d);
                    const active = dayFilter === d.day;
                    return (
                      <td
                        key={d.day}
                        onClick={() => onPickDay?.(d.day)}
                        className={`border-b border-l border-border/60 text-center px-1 py-1.5 transition-colors ${
                          onPickDay ? 'cursor-pointer' : ''
                        } ${active ? 'bg-indigo-100 dark:bg-indigo-500/25' : 'hover:bg-muted/50'}`}
                      >
                        {v === 0 ? (
                          <span className="text-muted-foreground/30">·</span>
                        ) : (
                          <span className={`font-semibold ${row.cls}`}>{v}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`bg-muted/30 border-b border-l border-border text-center px-2 py-1.5 font-semibold ${row.cls}`}>
                    {row.total || <span className="text-muted-foreground/40">·</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
