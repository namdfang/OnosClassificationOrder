import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, X } from 'lucide-react';
import type {
  FulfillmentDailyColumnTotals,
  FulfillmentDailyRow,
  FulfillmentStage,
} from 'shared';
import { FULFILLMENT_STAGE_LABELS, FULFILLMENT_STAGES } from 'shared';

import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const EMERALD = 'text-emerald-600 dark:text-emerald-400';
const AMBER = 'text-amber-600 dark:text-amber-400';
const RED = 'text-red-600 dark:text-red-400';
const INDIGO = 'text-indigo-600 dark:text-indigo-400';
const MUTED = 'text-muted-foreground';

/** Nguồn số liệu 1 cột — dùng chung cho 1 ngày và cột "Tổng" (cùng shape). */
type Metrics = Omit<FulfillmentDailyRow, 'day'>;

interface Data {
  days: FulfillmentDailyRow[];
  columnTotals: FulfillmentDailyColumnTotals;
  rangeDays: number;
}

const EMPTY_TOTALS: FulfillmentDailyColumnTotals = {
  total: 0,
  toolReviewed: 0,
  toolUnreviewed: 0,
  toolOk: 0,
  designerReceived: 0,
  designerDone: 0,
  stages: {},
};

const EMPTY: Data = { days: [], columnTotals: EMPTY_TOTALS, rangeDays: 0 };

function fmtHead(day: string): { wd: string; dm: string } {
  const d = new Date(`${day}T12:00:00+07:00`);
  return {
    wd: WEEKDAYS[d.getDay()] ?? '',
    dm: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
  };
}

// ─── Row descriptors ────────────────────────────────────────────────────────
type Tone = 'neutral' | 'highlight' | 'dim' | 'danger';

interface RowDesc {
  key: string;
  label: string;
  /** Hàng con (thụt lề) trong khối stage của user. */
  indent?: boolean;
  /** Hàng tiêu đề khối stage user — chỉ nhãn, không số. */
  header?: boolean;
  tone: Tone;
  /** 1 số / ô (căn trái). */
  single?: (m: Metrics) => number;
  singleCls?: string;
  /** 2 số / ô: [đã làm, còn lại] — slash căn giữa. */
  dual?: (m: Metrics) => [number, number];
  dualCls?: [string, string];
  /** Hàng công đoạn: hiện `0` khi giá trị = 0 (thay vì dấu `·`). */
  showZero?: boolean;
  /** Tooltip mô tả chi tiết ô (`day` = 'dd/MM' hoặc 'cả kỳ'). */
  tip: (m: Metrics, day: string) => string;
}

interface Props {
  /** Stage của user (highlight + bung 4 hàng). Undefined (admin override) → không highlight. */
  stage?: FulfillmentStage;
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
 * Bảng tổng quan theo ngày (Task Fulfillment) — FULL luồng tất cả khâu, gom theo
 * `inProductionAt` (VN). Mỗi ngày 1 cột; các hàng: Tổng đơn → Soát tool (đã/chưa
 * soát) → Designer (đã làm/còn lại) → 7 stage (đã xong/còn lại). Stage của user
 * bung 4 hàng Đến/Đã làm/Còn lại/Lỗi cần sửa; "Lỗi cần sửa" tô đỏ. Mỗi ô có
 * tooltip. Ô 2 số chia đều 2 bên (slash giữa); hàng công đoạn hiện `0` khi = 0.
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
  // Tooltip tự vẽ (hiện NGAY khi di chuột, không dùng title mặc định của trình duyệt).
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const showTip = (text: string, e: React.MouseEvent) => setTip({ text, x: e.clientX, y: e.clientY });
  const hideTip = () => setTip(null);

  useEffect(() => {
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.fulfillment.dailyOverview({
          ...(stage ? { stage } : {}),
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

  const rows = useMemo<RowDesc[]>(() => {
    const list: RowDesc[] = [
      {
        key: 'total',
        label: 'Tổng đơn',
        tone: 'neutral',
        single: (m) => m.total,
        singleCls: 'text-foreground',
        tip: (m, d) => `${d} · Tổng đơn vào sản xuất: ${m.total}`,
      },
      {
        key: 'tool',
        label: 'Soát tool',
        tone: 'neutral',
        dual: (m) => [m.toolReviewed, m.toolUnreviewed],
        dualCls: [EMERALD, AMBER],
        tip: (m, d) =>
          `${d} · Soát tool — Đã soát ${m.toolReviewed} / Chưa soát ${m.toolUnreviewed}. ` +
          `(đã soát = đơn đã có kết quả tool; chưa soát = chưa kiểm)`,
      },
      {
        key: 'designer',
        label: 'Designer',
        tone: 'neutral',
        dual: (m) => [m.designerDone, Math.max(0, m.designerReceived - m.designerDone)],
        dualCls: [EMERALD, INDIGO],
        tip: (m, d) =>
          `${d} · Designer — Đã làm ${m.designerDone} / Còn lại ${Math.max(0, m.designerReceived - m.designerDone)} ` +
          `(tổng nhận ${m.designerReceived}). Còn lại = đã giao nhưng chưa xong.`,
      },
    ];
    for (const st of FULFILLMENT_STAGES) {
      const label = FULFILLMENT_STAGE_LABELS[st];
      if (st === stage) {
        list.push({
          key: `${st}-h`,
          label,
          header: true,
          tone: 'highlight',
          tip: (_m, d) => `${d} · ${label} — công đoạn của bạn`,
        });
        list.push({
          key: `${st}-arrived`,
          label: 'Đến',
          indent: true,
          tone: 'highlight',
          showZero: true,
          single: (m) => m.stages[st]?.arrived ?? 0,
          singleCls: 'text-foreground',
          tip: (m, d) =>
            `${d} · ${label} / Đến: ${m.stages[st]?.arrived ?? 0} — tổng đơn cohort đã tới công đoạn này (= Đã làm + Còn lại + Lỗi)`,
        });
        list.push({
          key: `${st}-done`,
          label: 'Đã làm',
          indent: true,
          tone: 'highlight',
          showZero: true,
          single: (m) => m.stages[st]?.done ?? 0,
          singleCls: EMERALD,
          tip: (m, d) =>
            `${d} · ${label} / Đã làm: ${m.stages[st]?.done ?? 0} — đã hoàn thành công đoạn (status done, đã chuyển tiếp)`,
        });
        list.push({
          key: `${st}-remaining`,
          label: 'Còn lại',
          indent: true,
          tone: 'highlight',
          showZero: true,
          single: (m) => m.stages[st]?.remaining ?? 0,
          singleCls: INDIGO,
          tip: (m, d) =>
            `${d} · ${label} / Còn lại: ${m.stages[st]?.remaining ?? 0} — đang chờ + đang làm (waiting + in-progress)`,
        });
        list.push({
          key: `${st}-rework`,
          label: 'Lỗi cần sửa',
          indent: true,
          tone: 'danger',
          showZero: true,
          single: (m) => m.stages[st]?.rework ?? 0,
          singleCls: RED,
          tip: (m, d) =>
            `${d} · ${label} / Lỗi cần sửa: ${m.stages[st]?.rework ?? 0} — bị công đoạn sau đẩy về, cần làm lại (rework)`,
        });
      } else {
        list.push({
          key: st,
          label,
          tone: 'dim',
          showZero: true,
          dual: (m) => [
            m.stages[st]?.done ?? 0,
            Math.max(0, (m.stages[st]?.arrived ?? 0) - (m.stages[st]?.done ?? 0)),
          ],
          dualCls: [EMERALD, INDIGO],
          tip: (m, d) => {
            const s = m.stages[st];
            const left = Math.max(0, (s?.arrived ?? 0) - (s?.done ?? 0));
            return (
              `${d} · ${label} — Đã xong ${s?.done ?? 0} / Còn lại ${left} ` +
              `(tổng nhận ${s?.arrived ?? 0}, cộng dồn).`
            );
          },
        });
      }
    }
    return list;
  }, [stage]);

  const renderCell = (row: RowDesc, m: Metrics) => {
    if (row.header) return null;
    // 0: hàng công đoạn (`showZero`) hiện "0" (muted); các hàng khác hiện "·".
    const num = (v: number, cls: string) => {
      if (v !== 0) return <span className={cls}>{v}</span>;
      return row.showZero ? (
        <span className="text-muted-foreground/50">0</span>
      ) : (
        <span className="text-muted-foreground/30">·</span>
      );
    };
    if (row.single) {
      return <div className="text-left font-semibold">{num(row.single(m), row.singleCls ?? '')}</div>;
    }
    const [a, b] = row.dual!(m);
    const [clsA, clsB] = row.dualCls ?? [EMERALD, MUTED];
    // Chia 2 bên đều nhau: giá trị trái sát trái, phải sát phải, slash căn giữa.
    return (
      <div className="grid grid-cols-[1fr_auto_1fr] items-center font-semibold">
        <span className="text-left">{num(a, clsA)}</span>
        <span className="text-muted-foreground/40 px-1">/</span>
        <span className="text-right">{num(b, clsB)}</span>
      </div>
    );
  };

  const rowBgCls = (tone: Tone) =>
    tone === 'highlight'
      ? 'bg-indigo-50/60 dark:bg-indigo-500/10'
      : tone === 'danger'
        ? 'bg-red-50/70 dark:bg-red-500/10'
        : tone === 'dim'
          ? 'opacity-70'
          : '';

  const labelCls = (row: RowDesc) => {
    if (row.tone === 'highlight') return 'text-indigo-700 dark:text-indigo-300 font-semibold';
    if (row.tone === 'danger') return `${RED} font-semibold`;
    if (row.tone === 'dim') return 'text-muted-foreground';
    return 'font-medium text-foreground';
  };

  const labelBgCls = (tone: Tone) =>
    tone === 'highlight'
      ? 'bg-indigo-50 dark:bg-indigo-500/10'
      : tone === 'danger'
        ? 'bg-red-50 dark:bg-red-500/10'
        : 'bg-card';

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <CalendarRange size={15} className="text-indigo-600" />
        <span className="text-sm font-semibold">Tổng quan theo ngày</span>
        <span className="hidden md:inline text-[11px] text-muted-foreground">
          — theo ngày vào SX · ô 2 số = <b className="text-emerald-600">đã xong</b>/<b className="text-indigo-600">còn lại</b> · di chuột vào ô để xem chi tiết · bấm 1 ngày để lọc bên dưới
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
                <th className="sticky left-0 z-20 bg-card text-left font-medium px-3 py-2 border-b border-border min-w-[120px]">
                  Chỉ số
                </th>
                {days.map((d) => {
                  const { wd, dm } = fmtHead(d.day);
                  const active = dayFilter === d.day;
                  return (
                    <th
                      key={d.day}
                      onClick={() => onPickDay?.(d.day)}
                      className={`font-medium px-1.5 py-1.5 border-b border-l border-border text-center min-w-[62px] transition-colors ${onPickDay ? 'cursor-pointer' : ''
                        } ${active ? 'bg-indigo-100 dark:bg-indigo-500/25' : 'bg-card hover:bg-muted/60'}`}
                    >
                      <div className="text-[11px] text-muted-foreground leading-tight">{wd}</div>
                      <div className="leading-tight font-semibold">{dm}</div>
                    </th>
                  );
                })}
                <th className="bg-muted/30 font-semibold px-2 py-1.5 border-b border-l border-border text-center min-w-[62px]">
                  Tổng
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={rowBgCls(row.tone)}>
                  <td
                    className={`sticky left-0 z-10 ${labelBgCls(row.tone)} px-3 py-1.5 border-b border-border/60 ${row.indent ? 'pl-6' : ''
                      } ${labelCls(row)}`}
                  >
                    {row.indent && <span className="text-muted-foreground/50 mr-1">·</span>}
                    {row.label}
                  </td>
                  {days.map((d) => {
                    const active = dayFilter === d.day;
                    return (
                      <td
                        key={d.day}
                        onClick={() => onPickDay?.(d.day)}
                        onMouseEnter={(e) => showTip(row.tip(d, fmtHead(d.day).dm), e)}
                        onMouseMove={(e) => showTip(row.tip(d, fmtHead(d.day).dm), e)}
                        onMouseLeave={hideTip}
                        className={`border-b border-l border-border/60 px-1 py-1.5 transition-colors ${onPickDay ? 'cursor-pointer' : ''
                          } ${active ? 'bg-indigo-100/70 dark:bg-indigo-500/20' : 'hover:bg-muted/50'}`}
                      >
                        {renderCell(row, d)}
                      </td>
                    );
                  })}
                  <td
                    className="bg-muted/30 border-b border-l border-border px-2 py-1.5"
                    onMouseEnter={(e) => showTip(row.tip(columnTotals, 'Tổng cả kỳ'), e)}
                    onMouseMove={(e) => showTip(row.tip(columnTotals, 'Tổng cả kỳ'), e)}
                    onMouseLeave={hideTip}
                  >
                    {renderCell(row, columnTotals)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tip && (
        <div
          className="fixed z-50 pointer-events-none max-w-xs rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] leading-snug text-popover-foreground shadow-lg"
          style={{
            left: tip.x > window.innerWidth * 0.6 ? tip.x - 12 : tip.x + 12,
            top: tip.y + 16,
            transform: tip.x > window.innerWidth * 0.6 ? 'translateX(-100%)' : undefined,
          }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
