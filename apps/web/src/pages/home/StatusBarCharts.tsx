import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarRange, ImageOff, Users, X } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import type { ProductBreakdownDesigner, TeamDailyCell, TeamDailyRow } from 'shared';
import { PRODUCT_LEVEL_MAP } from 'shared';

import { RepositoryRemote } from '@/services';

import { DateRangePicker } from '@/components/common/DateRangePicker';
import { Spinner } from '@/components/common/Spinner';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

type Mode = 'designer' | 'day';
type RangeDays = 7 | 14 | 30;
const RANGES: RangeDays[] = [7, 14, 30];

// Bộ màu + nhãn 4 trạng thái — đồng bộ với ma trận (zinc/amber/indigo/emerald).
const STATUS = [
  { key: 'assigned', label: 'Cần làm', color: '#71717A' },
  { key: 'rework', label: 'Cần làm lại', color: '#F59E0B' },
  { key: 'inProgress', label: 'Đang làm', color: '#6366F1' },
  { key: 'done', label: 'Đã xong', color: '#10B981' },
] as const;
const LABEL: Record<string, string> = Object.fromEntries(STATUS.map((s) => [s.key, s.label]));

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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dm(day: string): string {
  const d = new Date(`${day}T12:00:00+07:00`);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface Props {
  /** Filter sản phẩm (`order.type`) — dùng chung toàn tab. */
  type?: string;
  /** Filter khách hàng (`order.userSku`) — dùng chung toàn tab. */
  customer?: string;
  /** Bộ lọc ngày chung của tab — dùng cho breakdown sản phẩm trong tooltip. */
  filterDays?: 7 | 14 | 30;
  filterFrom?: string;
  filterTo?: string;
}

export function StatusBarCharts({ type, customer, filterDays, filterFrom, filterTo }: Props) {
  const [mode, setMode] = useState<Mode>('designer');
  // Chế độ "theo designer": date-range riêng (mặc định 30 ngày).
  const [dFrom, setDFrom] = useState(daysAgoISO(29));
  const [dTo, setDTo] = useState(todayISO());
  // Chế độ "theo ngày": 7/14/30 + lọc theo người.
  const [range, setRange] = useState<RangeDays>(7);
  const [personId, setPersonId] = useState('');

  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  // Breakdown sản phẩm theo designer (userId → {products,total}) cho tooltip.
  const [breakdownMap, setBreakdownMap] = useState<Record<string, ProductBreakdownDesigner>>({});
  const bdSeqRef = useRef(0);
  useEffect(() => {
    const seq = ++bdSeqRef.current;
    (async () => {
      try {
        const res = await RepositoryRemote.designer.productBreakdown({
          ...(filterFrom && filterTo ? { from: filterFrom, to: filterTo } : { days: filterDays || 7 }),
          ...(type ? { type } : {}),
          ...(customer ? { customer } : {}),
        });
        if (seq !== bdSeqRef.current) return;
        const list = (res.data?.data?.designers || []) as ProductBreakdownDesigner[];
        setBreakdownMap(Object.fromEntries(list.map((d) => [d.userId, d])));
      } catch (err) {
        if (seq === bdSeqRef.current) handleAxiosError(err);
      }
    })();
  }, [filterDays, filterFrom, filterTo, type, customer]);

  useEffect(() => {
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const params = {
          ...(mode === 'designer' ? { from: dFrom, to: dTo } : { days: range }),
          ...(type ? { type } : {}),
          ...(customer ? { customer } : {}),
        };
        const res = await RepositoryRemote.designer.teamDailyBreakdown(params);
        if (seq !== seqRef.current) return;
        setData((res.data?.data as Data) || EMPTY);
      } catch (err) {
        if (seq === seqRef.current) handleAxiosError(err);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, [mode, dFrom, dTo, range, type, customer]);

  // Chế độ designer: 1 cột / designer (chỉ người có đơn), stack 100%.
  const designerData = useMemo(
    () =>
      data.rows
        .filter((r) => r.totals.assigned + r.totals.rework + r.totals.inProgress + r.totals.done > 0)
        .map((r) => ({
          name: r.fullName,
          userId: r.userId,
          assigned: r.totals.assigned,
          rework: r.totals.rework,
          inProgress: r.totals.inProgress,
          done: r.totals.done,
        })),
    [data.rows],
  );

  // Chế độ ngày: 1 cột / ngày (cũ→mới trái→phải), stack số lượng.
  const dayData = useMemo(() => {
    const row = personId ? data.rows.find((r) => r.userId === personId) : undefined;
    const source = (i: number): TeamDailyCell =>
      row ? row.cells[i] : data.columnTotals[i] || { assigned: 0, rework: 0, inProgress: 0, done: 0, unfinished: 0 };
    // data.days mới→cũ → đảo để hiển thị quá khứ→hiện tại.
    return data.days
      .map((day, i) => ({ day, i }))
      .reverse()
      .map(({ day, i }) => {
        const c = source(i);
        return { name: dm(day), assigned: c.assigned, rework: c.rework, inProgress: c.inProgress, done: c.done };
      });
  }, [data, personId]);

  const chartData = mode === 'designer' ? designerData : dayData;
  const isEmpty = !loading && chartData.length === 0;

  // ── Panel "thống kê 7 ngày" khi bấm cột 1 designer (mode designer) ──────
  // Data RIÊNG, LUÔN 7 ngày gần nhất (không theo date-range của biểu đồ):
  // team-daily-breakdown (per-day 4 trạng thái) + product-breakdown (sản phẩm).
  const [selDesigner, setSelDesigner] = useState<{ userId: string; name: string } | null>(null);
  const [weekData, setWeekData] = useState<Data | null>(null);
  const [weekProducts, setWeekProducts] = useState<Record<string, ProductBreakdownDesigner> | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const weekSeqRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Đổi bộ lọc chung → cache 7 ngày cũ không còn đúng.
  useEffect(() => {
    setWeekData(null);
    setWeekProducts(null);
  }, [type, customer]);

  useEffect(() => {
    if (!selDesigner || (weekData && weekProducts)) return;
    const seq = ++weekSeqRef.current;
    (async () => {
      try {
        setWeekLoading(true);
        const common = { days: 7 as const, ...(type ? { type } : {}), ...(customer ? { customer } : {}) };
        const [teamRes, prodRes] = await Promise.all([
          RepositoryRemote.designer.teamDailyBreakdown(common),
          RepositoryRemote.designer.productBreakdown(common),
        ]);
        if (seq !== weekSeqRef.current) return;
        setWeekData((teamRes.data?.data as Data) || EMPTY);
        const list = (prodRes.data?.data?.designers || []) as ProductBreakdownDesigner[];
        setWeekProducts(Object.fromEntries(list.map((d) => [d.userId, d])));
      } catch (err) {
        if (seq === weekSeqRef.current) handleAxiosError(err);
      } finally {
        if (seq === weekSeqRef.current) setWeekLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selDesigner, weekData, weekProducts]);

  useEffect(() => {
    if (selDesigner) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selDesigner]);

  const handleBarClick = (payload?: { userId?: string; name?: string }) => {
    if (mode !== 'designer' || !payload?.userId) return;
    setSelDesigner({ userId: payload.userId, name: payload.name || '' });
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header: toggle + controls */}
      <div className="flex items-center justify-between gap-3 p-3 border-b border-border flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-indigo-600" />
          <span className="text-sm font-semibold">Cơ cấu trạng thái</span>
          {/* Toggle mode */}
          <div className="ml-1 flex items-center rounded-md border border-border overflow-hidden text-[11px]">
            <ToggleBtn active={mode === 'designer'} onClick={() => setMode('designer')} icon={<Users size={12} />}>
              Theo designer
            </ToggleBtn>
            <ToggleBtn active={mode === 'day'} onClick={() => setMode('day')} icon={<CalendarRange size={12} />}>
              Theo ngày
            </ToggleBtn>
          </div>
        </div>

        {/* Controls theo mode */}
        <div className="flex items-center gap-2 flex-wrap">
          {mode === 'designer' ? (
            <DateRangePicker
              variant="inline"
              from={dFrom}
              to={dTo}
              clearable={false}
              onChange={(f, t) => {
                setDFrom(f);
                setDTo(t);
              }}
            />
          ) : (
            <>
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
              <select
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Tất cả</option>
                {data.rows.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.fullName}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-2 text-[11px] text-muted-foreground border-b border-border">
        {STATUS.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto text-[10px]">
          {mode === 'designer'
            ? 'Mỗi cột = 1 designer, chuẩn hóa 100% theo trạng thái. Bấm cột → thống kê 7 ngày bên dưới.'
            : 'Mỗi cột = 1 ngày, chiều cao = số đơn. Hover xem chi tiết.'}
        </span>
      </div>

      {/* Chart */}
      <div className="p-3">
        {isEmpty ? (
          <p className="text-xs text-muted-foreground text-center py-16">Không có dữ liệu trong khoảng đã chọn.</p>
        ) : (
          <div style={{ width: '100%', height: 320 }} className={mode === 'designer' ? 'cursor-pointer' : undefined}>
            <ResponsiveContainer>
              <BarChart
                data={chartData}
                stackOffset={mode === 'designer' ? 'expand' : 'none'}
                margin={{ top: 8, right: 8, left: mode === 'designer' ? 0 : -12, bottom: mode === 'designer' ? 40 : 4 }}
                onClick={(state) =>
                  handleBarClick(
                    (state as { activePayload?: { payload?: { userId?: string; name?: string } }[] })
                      ?.activePayload?.[0]?.payload,
                  )
                }
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={mode === 'designer' ? -25 : 0}
                  textAnchor={mode === 'designer' ? 'end' : 'middle'}
                  height={mode === 'designer' ? 50 : 20}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  allowDecimals={false}
                  domain={mode === 'designer' ? [0, 1] : undefined}
                  tickFormatter={mode === 'designer' ? (v: number) => `${Math.round(v * 100)}%` : undefined}
                />
                <RTooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  content={<ChartTooltip breakdown={mode === 'designer' ? breakdownMap : undefined} />}
                />
                {STATUS.map((s) => (
                  <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} maxBarSize={64} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Panel thống kê 7 ngày của designer vừa bấm (chỉ mode "Theo designer"). */}
      {mode === 'designer' && selDesigner && (
        <div ref={panelRef} className="border-t border-indigo-300 dark:border-indigo-800">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
            <Users size={14} className="text-indigo-600 shrink-0" />
            <span className="text-sm font-semibold">{selDesigner.name}</span>
            <span className="text-[11px] text-muted-foreground">— thống kê 7 ngày gần nhất (theo ngày vào SX)</span>
            {weekLoading && <Spinner size={12} className="text-muted-foreground" />}
            <button
              type="button"
              onClick={() => setSelDesigner(null)}
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X size={13} /> Đóng
            </button>
          </div>
          {weekLoading && !weekData ? (
            <div className="py-8 text-center">
              <Spinner size={16} className="text-muted-foreground" />
            </div>
          ) : (
            <WeekStatsPanel
              userId={selDesigner.userId}
              data={weekData || EMPTY}
              products={weekProducts?.[selDesigner.userId]}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Nội dung panel 7 ngày: 4 chip tổng trạng thái + bảng 4 trạng thái × 7 ngày +
 * bảng sản phẩm designer làm trong 7 ngày (mockup + level + count).
 */
function WeekStatsPanel({
  userId,
  data,
  products,
}: {
  userId: string;
  data: Data;
  products?: ProductBreakdownDesigner;
}) {
  // BE trả ngày mới→cũ → đảo để hiển thị quá khứ→hiện tại (đồng bộ index cells).
  const row = data.rows.find((r) => r.userId === userId);
  const days = useMemo(() => [...data.days].reverse(), [data.days]);
  const cells = useMemo(() => (row ? [...row.cells].reverse() : []), [row]);
  const totals = row?.totals;

  return (
    <div className="p-3 space-y-3">
      {/* 4 chip tổng — cùng bộ màu/label với legend biểu đồ. */}
      <div className="flex flex-wrap gap-2">
        {STATUS.map((s) => {
          const v = totals ? totals[s.key as keyof TeamDailyCell] : 0;
          return (
            <span
              key={s.key}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px]"
            >
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
              <span className="tabular-nums font-semibold">{v}</span>
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Bảng 4 trạng thái × 7 ngày */}
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-[12px] tabular-nums">
            <thead>
              <tr className="text-[11px] text-muted-foreground border-b border-border">
                <th className="text-left font-medium px-2.5 py-1.5 min-w-[90px]">Trạng thái</th>
                {days.map((d) => (
                  <th key={d} className="text-center font-medium px-1.5 py-1.5 border-l border-border/60">
                    {dm(d)}
                  </th>
                ))}
                <th className="text-center font-semibold px-2 py-1.5 border-l border-border bg-muted/30">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {STATUS.map((s) => (
                <tr key={s.key} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-2.5 py-1.5">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                  </td>
                  {days.map((d, i) => {
                    const v = cells[i]?.[s.key as keyof TeamDailyCell] ?? 0;
                    return (
                      <td key={d} className="text-center px-1.5 py-1.5 border-l border-border/40">
                        {v === 0 ? <span className="text-muted-foreground/30">·</span> : v}
                      </td>
                    );
                  })}
                  <td className="text-center px-2 py-1.5 border-l border-border bg-muted/30 font-semibold">
                    {totals ? totals[s.key as keyof TeamDailyCell] : 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!row && (
            <p className="text-[11px] text-muted-foreground text-center py-3">
              Không có đơn nào trong 7 ngày gần nhất.
            </p>
          )}
        </div>

        {/* Sản phẩm designer làm trong 7 ngày */}
        <div className="rounded-md border border-border">
          <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground border-b border-border">
            Sản phẩm trong 7 ngày
            {products && (
              <span>
                {' '}
                — {products.products.length} sản phẩm · {products.total} đơn
              </span>
            )}
          </div>
          {!products || products.products.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-4">Không có sản phẩm nào.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto divide-y divide-border/50">
              {products.products.map((p) => (
                <div key={p.type} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]">
                  {p.mockup ? (
                    <img
                      src={p.mockup}
                      alt=""
                      className="w-8 h-8 rounded object-cover border border-border bg-muted shrink-0"
                    />
                  ) : (
                    <span className="w-8 h-8 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground shrink-0">
                      <ImageOff size={12} />
                    </span>
                  )}
                  {p.level != null && (
                    <span
                      className="text-[9px] px-1 py-0.5 rounded text-white shrink-0"
                      style={{ backgroundColor: PRODUCT_LEVEL_MAP[p.level]?.color }}
                    >
                      Lv{p.level}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 truncate">{p.fullName || p.type}</span>
                  <span className="tabular-nums font-semibold shrink-0">{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2.5 py-1 font-medium transition-colors',
        active ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
  payload?: { userId?: string };
}
function ChartTooltip({
  active,
  payload,
  label,
  breakdown,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  /** userId → breakdown sản phẩm (chỉ mode designer). */
  breakdown?: Record<string, ProductBreakdownDesigner>;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  const userId = payload[0]?.payload?.userId;
  const bd = breakdown && userId ? breakdown[userId] : undefined;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-md max-w-[300px]">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.color }} />
            {LABEL[p.dataKey] || p.dataKey}
          </span>
          <span className="tabular-nums">
            {p.value}
            {total > 0 && <span className="text-muted-foreground"> · {Math.round((p.value / total) * 100)}%</span>}
          </span>
        </div>
      ))}
      <div className="mt-1 border-t border-border pt-1 flex items-center justify-between font-semibold">
        <span>Tổng</span>
        <span className="tabular-nums">{total}</span>
      </div>

      {/* Breakdown sản phẩm — hiển thị HẾT (không scroll để tooltip không biến mất). */}
      {bd && bd.products.length > 0 && (
        <div className="mt-2 border-t border-border pt-1.5">
          <div className="text-[10px] text-muted-foreground mb-1">
            {bd.products.length} sản phẩm · {bd.total} đơn (theo bộ lọc chung)
          </div>
          <div className="space-y-1">
            {bd.products.map((p) => (
              <div key={p.type} className="flex items-center gap-1.5">
                {p.mockup ? (
                  <img
                    src={p.mockup}
                    alt=""
                    className="w-7 h-7 rounded object-cover border border-border bg-muted shrink-0"
                  />
                ) : (
                  <span className="w-7 h-7 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground shrink-0">
                    <ImageOff size={11} />
                  </span>
                )}
                {p.level != null && (
                  <span
                    className="text-[9px] px-1 py-0.5 rounded text-white shrink-0"
                    style={{ backgroundColor: PRODUCT_LEVEL_MAP[p.level]?.color }}
                  >
                    Lv{p.level}
                  </span>
                )}
                <span className="flex-1 min-w-0 truncate">{p.fullName || p.type}</span>
                <span className="tabular-nums font-semibold shrink-0">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
