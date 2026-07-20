import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Factory,
  Flame,
  Hourglass,
  Inbox,
  LogIn,
  LogOut,
  Package,
  PackageCheck,
  Palette,
  Printer,
  RotateCw,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { RepositoryRemote } from '@/services';

import { OrderFilterBar } from '@/components/orders/OrderFilterBar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { usePermission } from '@/hooks/usePermission';

import { useAuthStore } from '../../store/authStore';

interface LifecycleStageRow {
  stage: string;
  label: string;
  backlog: number;
  waitingToStart: number;
  inProgress: number;
  rework: number;
  error: number;
  doneInRange: number;
  passedTotal: number;
  avgWorkMs: number;
}

interface LifecycleOverview {
  stages: LifecycleStageRow[];
  totals: {
    totalActive: number;
    completedInRange: number;
    avgTotalCycleMs: number;
    bottleneckStage: string | null;
  };
  completionTimeline: Array<{ date: string; completed: number }>;
  factories: Array<{ factoryId: string; factoryName: string }>;
  filter: { factoryId?: string; from?: string; to?: string };
}

/** Icon + nhãn ngắn cho mỗi chặng (dùng trong phễu + biểu đồ). */
const STAGE_META: Record<string, { icon: React.ElementType; short: string }> = {
  'tool-check': { icon: ClipboardCheck, short: 'Soát tool' },
  designer: { icon: Palette, short: 'Thiết kế' },
  print: { icon: Printer, short: 'In' },
  press: { icon: Flame, short: 'Ép' },
  'qc-post-press': { icon: ShieldCheck, short: 'QC ép' },
  'sew-in': { icon: LogIn, short: 'May vào' },
  'sew-out': { icon: LogOut, short: 'May ra' },
  pack: { icon: Package, short: 'Đóng hàng' },
};

// Đường ray (rail) indigo liền mạch nối các công đoạn trong phễu.
const RAIL_H = 'relative h-[3px] w-full rounded-full bg-indigo-400/70 dark:bg-indigo-500/50';
const RAIL_V = 'relative w-[3px] h-full rounded-full bg-indigo-400/70 dark:bg-indigo-500/50';
const RAIL_TIP = 'absolute text-indigo-500 dark:text-indigo-400';

const SEGMENT_COLORS = {
  backlog: '#94a3b8', // slate-400 — đang chứa
  inProgress: '#6366f1', // indigo-500 — đang làm
  rework: '#f59e0b', // amber-500
  error: '#f43f5e', // rose-500
};

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** ms → chuỗi ngắn gọn (phút / giờ / ngày). 0 hoặc âm → "—". */
function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} phút`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr > 0 ? `${d} ngày ${hr}h` : `${d} ngày`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'amber' | 'emerald';
  loading?: boolean;
}

function KpiCard({ label, value, sub, icon, tone = 'default', loading }: KpiCardProps) {
  if (loading) return <div className="rounded-xl bg-muted/40 animate-pulse h-[78px]" />;
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 transition-colors',
        tone === 'amber'
          ? 'border-amber-300/60 bg-amber-50/50 dark:bg-amber-500/5'
          : tone === 'emerald'
            ? 'border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-500/5'
            : 'border-border bg-card hover:bg-muted/20',
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <span className="opacity-70 shrink-0">{icon}</span>
        <span className="text-[11px] font-medium truncate">{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground leading-none">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground truncate mt-1">{sub}</p>}
    </div>
  );
}

type FunnelNode = { kind: 'stage'; row: LifecycleStageRow; step: number } | { kind: 'done'; completed: number };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Sắp các node của 1 hàng vào `cols` slot theo kiểu rắn bò (boustrophedon):
 * hàng chẵn trái→phải, hàng lẻ lấp từ phải→trái để node đầu hàng lẻ nằm ngay
 * dưới node cuối hàng chẵn (nối liền mạch). Slot trống = null (spacer căn cột).
 */
function buildSlots(row: FunnelNode[], rowIndex: number, cols: number): (FunnelNode | null)[] {
  const slots: (FunnelNode | null)[] = new Array(cols).fill(null);
  if (rowIndex % 2 === 0) row.forEach((n, k) => (slots[k] = n));
  else row.forEach((n, k) => (slots[cols - 1 - k] = n));
  return slots;
}

/** Cột xảy ra "rẽ xuống" sau 1 hàng (để vẽ mũi tên ChevronDown nối hàng kế). */
function turnColumn(rowLen: number, rowIndex: number, cols: number): number {
  return rowIndex % 2 === 0 ? rowLen - 1 : cols - rowLen;
}

/** 1 chỉ số trong node — kèm tooltip giải thích đây là trường gì. */
function Metric({
  icon,
  label,
  value,
  desc,
  valueClass,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  desc: string;
  valueClass?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-2 py-1.5 cursor-help hover:bg-muted/70 transition-colors">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 truncate">
            {icon}
            {label}
          </span>
          <span className={cn('text-sm font-semibold tabular-nums leading-none', valueClass)}>{value}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[230px]">{desc}</TooltipContent>
    </Tooltip>
  );
}

const dash = (n: number) => (n === 0 ? '–' : formatNumber(n));

/** Node lớn trong phễu — đầy đủ chỉ số + tooltip mỗi trường. */
function FunnelNodeCard({ node, isBottleneck }: { node: FunnelNode; isBottleneck: boolean }) {
  if (node.kind === 'done') {
    return (
      <div className="flex-1 min-w-0 rounded-lg border border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-500/10 p-3 flex flex-col">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
            ✓
          </span>
          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">Hoàn thành</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help mt-auto">
              <div className="text-[28px] leading-none font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatNumber(node.completed)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">hoàn thành trong kỳ</div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[230px]">
            Số đơn đã đóng hàng xong (kết thúc toàn bộ quy trình) trong khoảng thời gian đã chọn.
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  const s = node.row;
  const meta = STAGE_META[s.stage];
  const Icon = meta?.icon ?? Clock;
  const isTool = s.stage === 'tool-check';

  return (
    <div
      className={cn(
        'flex-1 min-w-0 rounded-lg border p-3 flex flex-col transition-colors',
        isBottleneck
          ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-500/10 ring-1 ring-amber-300'
          : 'border-border bg-background hover:bg-muted/30',
      )}
    >
      {/* Header: step + icon + tên */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
          {node.step}
        </span>
        <Icon size={15} className={cn('shrink-0', isBottleneck ? 'text-amber-600' : 'text-primary')} />
        <span className="text-xs font-semibold text-foreground truncate">{s.label}</span>
        {isBottleneck && (
          <span className="ml-auto text-[8px] uppercase tracking-wide font-bold text-amber-600 bg-amber-100 dark:bg-amber-500/15 px-1 py-0.5 rounded shrink-0">
            tắc
          </span>
        )}
      </div>

      {/* Backlog — số lớn */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help mb-2">
            <div className="text-[26px] leading-none font-bold tabular-nums text-foreground">
              {formatNumber(s.backlog)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">đang chờ</div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[230px]">
          {isTool
            ? 'Số đơn CHƯA soát tool (cột Note kq tool còn trống).'
            : `Số đơn đang chờ tại "${s.label}" — đã tới công đoạn nhưng worker chưa bắt đầu.`}
        </TooltipContent>
      </Tooltip>

      {/* 2×3 chỉ số */}
      <div className="grid grid-cols-2 gap-1.5">
        <Metric
          icon={<Inbox size={9} />}
          label="Chờ nhận"
          value={isTool ? '–' : dash(s.waitingToStart)}
          valueClass="text-sky-700 dark:text-sky-300"
          desc={
            isTool
              ? 'Chặng soát tool không có bước nhận task.'
              : s.stage === 'designer'
                ? 'Số đơn đã giao cho sub-designer nhưng chưa bấm "Nhận làm".'
                : `Số đơn đã tới "${s.label}" nhưng worker chưa bấm "Bắt đầu".`
          }
        />
        <Metric
          icon={<Activity size={9} />}
          label="Đang làm"
          value={isTool ? '–' : dash(s.inProgress)}
          valueClass="text-indigo-700 dark:text-indigo-300"
          desc={isTool ? 'Chặng soát tool không có trạng thái "đang làm".' : `Số đơn đang được làm tại "${s.label}".`}
        />
        <Metric
          icon={<RotateCw size={9} />}
          label="Rework"
          value={isTool ? '–' : dash(s.rework)}
          valueClass="text-amber-700 dark:text-amber-300"
          desc={isTool ? 'Chặng soát tool không có rework.' : `Số đơn bị đẩy lại "${s.label}" để làm lại.`}
        />
        <Metric
          icon={<AlertTriangle size={9} />}
          label="Lỗi"
          value={dash(s.error)}
          valueClass="text-rose-700 dark:text-rose-300"
          desc={
            isTool
              ? 'Số đơn bị soát ra lỗi (Note kq tool = "error").'
              : `Số đơn đang bị đánh lỗi sản xuất tại "${s.label}".`
          }
        />
        <Metric
          icon={<PackageCheck size={9} />}
          label="HT (kỳ)"
          value={dash(s.doneInRange)}
          valueClass="text-emerald-700 dark:text-emerald-300"
          desc={`Số đơn đã hoàn thành "${s.label}" trong khoảng thời gian đã chọn.`}
        />
        <Metric
          icon={<Hourglass size={9} />}
          label="Time TB"
          value={formatDuration(s.avgWorkMs)}
          desc={
            isTool
              ? 'Thời gian trung bình từ lúc đơn vào sản xuất đến lúc soát xong (trong kỳ).'
              : `Thời gian làm trung bình một đơn tại "${s.label}" (đơn hoàn thành trong kỳ).`
          }
        />
      </div>

      {/* Footer: đã qua / đã soát */}
      <div className="mt-1.5">
        <Metric
          icon={<CheckCircle2 size={9} />}
          label={isTool ? 'Đã soát (tổng)' : 'Đã qua (tổng)'}
          value={formatNumber(s.passedTotal)}
          desc={
            isTool
              ? 'Tổng số đơn đã được soát tool (Note kq tool có giá trị).'
              : `Tổng số đơn đã từng đi qua "${s.label}" (tích lũy).`
          }
        />
      </div>
    </div>
  );
}

/**
 * Tab "Vòng đời đơn" — phễu 9 chặng từ Soát tool → Đóng hàng + bảng chi tiết +
 * 2 biểu đồ (stacked bar tồn đọng theo chặng, line đơn hoàn thành/ngày). Data
 * từ `GET /v1/orders/lifecycle-overview`. Xem `OrderLifecycle.md`.
 */
export default function LifecycleTab() {
  const { profile } = useAuthStore();
  const { roleName } = usePermission();
  // User gắn 1 xưởng (Fulfillment) → khóa vào xưởng đó. Role quản lý chọn mọi xưởng.
  const isOverrideRole = ['SuperAdmin', 'Admin', 'Manager', 'SupportManager', 'Support'].includes(roleName ?? '');
  const lockedFactoryId = !isOverrideRole ? profile?.factoryId : undefined;

  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LifecycleOverview | null>(null);
  // Mặc định 7 ngày gần nhất. Bộ lọc ngày = NGÀY VÀO SẢN XUẤT (inProductionAt):
  // giới hạn tập đơn → snapshot cho biết đơn của (các) ngày đó đang ở công đoạn nào.
  const [startDate, setStartDate] = useState<string>(() => searchParams.get('lfrom') || daysAgoISO(6));
  const [endDate, setEndDate] = useState<string>(() => searchParams.get('lto') || todayISO());
  const [selectedFactory, setSelectedFactory] = useState<string>(() => searchParams.get('lfactory') || '');

  const effectiveFactory = lockedFactoryId ?? selectedFactory;

  // Số cột phễu (rắn bò) — responsive để khối luôn vuông gọn, không cuộn ngang.
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      setCols(w >= 1280 ? 4 : w >= 920 ? 3 : w >= 560 ? 2 : 1);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        startDate ? sp.set('lfrom', startDate) : sp.delete('lfrom');
        endDate ? sp.set('lto', endDate) : sp.delete('lto');
        selectedFactory ? sp.set('lfactory', selectedFactory) : sp.delete('lfactory');
        return sp;
      },
      { replace: true },
    );
  }, [startDate, endDate, selectedFactory, setSearchParams]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.set('from', startDate);
      if (endDate) params.set('to', endDate);
      if (effectiveFactory) params.set('factoryId', effectiveFactory);
      const resp = await RepositoryRemote.order.getLifecycleOverview(`?${params.toString()}`);
      setData(resp.data.data);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, effectiveFactory]);

  const stages = data?.stages ?? [];
  const totals = data?.totals;
  const lockedFactoryName = lockedFactoryId
    ? data?.factories.find((f) => f.factoryId === lockedFactoryId)?.factoryName
    : undefined;

  const barData = useMemo(
    () =>
      stages.map((s) => ({
        name: STAGE_META[s.stage]?.short ?? s.label,
        'Đang chứa': s.backlog,
        'Đang làm': s.inProgress,
        Rework: s.rework,
        Lỗi: s.error,
      })),
    [stages],
  );

  const lineData = data?.completionTimeline ?? [];
  const isRefetching = loading && !!data;

  // Node phễu theo kiểu rắn bò — 9 chặng + node "Hoàn thành", chia theo `cols`.
  const funnelRows = useMemo(() => {
    const nodes: FunnelNode[] = [
      ...stages.map((s, i) => ({ kind: 'stage' as const, row: s, step: i + 1 })),
      { kind: 'done' as const, completed: totals?.completedInRange ?? 0 },
    ];
    return chunk(nodes, cols);
  }, [stages, totals, cols]);

  return (
    <div className="space-y-5 max-w-[1440px] mx-auto relative">
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-0.5 overflow-hidden rounded-full bg-primary/10 pointer-events-none transition-opacity duration-200',
          loading ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="h-full w-1/4 bg-primary rounded-full animate-indeterminate-bar" />
      </div>

      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Vòng đời đơn hàng</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lọc theo ngày vào sản xuất → xem đơn của (các) ngày đó hiện đang tồn ở công đoạn nào
          </p>
        </div>
      </div>

      <OrderFilterBar
        createdFrom={startDate}
        createdTo={endDate}
        onDateRangeChange={(f, t) => {
          setStartDate(f);
          setEndDate(t);
        }}
        onReload={fetchData}
        loading={loading}
        facets={
          lockedFactoryId
            ? []
            : [
                {
                  key: 'factory',
                  label: 'Xưởng',
                  value: selectedFactory,
                  onChange: setSelectedFactory,
                  options: [
                    { value: '', label: 'Tất cả xưởng' },
                    ...(data?.factories ?? []).map((f) => ({ value: f.factoryId, label: f.factoryName })),
                  ],
                },
              ]
        }
        topActionsRight={
          lockedFactoryId ? (
            <span className="inline-flex items-center gap-1.5 text-xs bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 px-2.5 py-1.5 rounded-md">
              <Factory size={12} />
              <span className="font-medium">{lockedFactoryName || 'Xưởng của tôi'}</span>
            </span>
          ) : undefined
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Đơn đang trong quy trình"
          value={totals ? formatNumber(totals.totalActive) : '—'}
          sub="Chưa đóng hàng xong"
          icon={<Activity size={13} />}
          loading={loading && !data}
        />
        <KpiCard
          label="Hoàn thành trong kỳ"
          value={totals ? formatNumber(totals.completedInRange) : '—'}
          sub={`${startDate} → ${endDate}`}
          icon={<PackageCheck size={13} />}
          tone="emerald"
          loading={loading && !data}
        />
        <KpiCard
          label="Cycle time trung bình"
          value={totals ? formatDuration(totals.avgTotalCycleMs) : '—'}
          sub="Thiết kế → đóng hàng"
          icon={<Timer size={13} />}
          loading={loading && !data}
        />
        <KpiCard
          label="Công đoạn tắc nghẽn"
          value={
            totals?.bottleneckStage
              ? STAGE_META[totals.bottleneckStage]?.short ??
                stages.find((s) => s.stage === totals.bottleneckStage)?.label ??
                '—'
              : '—'
          }
          sub={
            totals?.bottleneckStage
              ? `${formatNumber(stages.find((s) => s.stage === totals.bottleneckStage)?.backlog ?? 0)} đơn đang chờ`
              : 'Không có tồn đọng'
          }
          icon={<AlertTriangle size={13} />}
          tone={totals?.bottleneckStage ? 'amber' : 'default'}
          loading={loading && !data}
        />
      </div>

      {/* Phễu các chặng — bố cục rắn bò (boustrophedon) để thấy hết không cuộn */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground mb-1">Phễu công đoạn</h2>
        {/* <p className="text-xs text-muted-foreground mb-4">
          Đơn vào sản xuất trong khoảng ngày đã lọc, hiện đang nằm ở công đoạn nào. Đi theo số thứ tự (rắn bò); di chuột vào số để xem chú thích.
        </p> */}
        {loading && !data ? (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-[210px] rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <TooltipProvider delayDuration={120}>
            {/* Bố cục rắn bò + đường ray (rail) indigo liền mạch nối các công đoạn */}
            <div className="space-y-0">
              {funnelRows.map((row, r) => {
                const slots = buildSlots(row, r, cols);
                const goRight = r % 2 === 0;
                const tCol = turnColumn(row.length, r, cols);
                return (
                  <React.Fragment key={r}>
                    {/* Hàng node — gap-0, ray nằm trong ô nối để chạm sát cạnh node */}
                    <div className="flex items-stretch gap-0">
                      {slots.map((node, c) => (
                        <React.Fragment key={c}>
                          {node ? (
                            <FunnelNodeCard
                              node={node}
                              isBottleneck={
                                node.kind === 'stage' &&
                                totals?.bottleneckStage === node.row.stage &&
                                node.row.backlog > 0
                              }
                            />
                          ) : (
                            <div className="flex-1 min-w-0" />
                          )}
                          {c < cols - 1 && (
                            <div className="w-8 shrink-0 flex items-center">
                              {slots[c] && slots[c + 1] ? (
                                <div className={RAIL_H}>
                                  {goRight ? (
                                    <ChevronRight
                                      size={14}
                                      strokeWidth={3}
                                      className={cn(RAIL_TIP, 'top-1/2 -translate-y-1/2 -right-1')}
                                    />
                                  ) : (
                                    <ChevronLeft
                                      size={14}
                                      strokeWidth={3}
                                      className={cn(RAIL_TIP, 'top-1/2 -translate-y-1/2 -left-1')}
                                    />
                                  )}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                    {/* Ray rẽ xuống nối sang hàng kế — căn đúng cột node bên trên */}
                    {r < funnelRows.length - 1 && (
                      <div className="flex items-stretch gap-0 h-7">
                        {Array.from({ length: cols }).map((_, c) => (
                          <React.Fragment key={c}>
                            <div className="flex-1 min-w-0 flex justify-center">
                              {c === tCol ? (
                                <div className={RAIL_V}>
                                  <ChevronDown
                                    size={14}
                                    strokeWidth={3}
                                    className={cn(RAIL_TIP, '-bottom-1 left-1/2 -translate-x-1/2')}
                                  />
                                </div>
                              ) : null}
                            </div>
                            {c < cols - 1 && <div className="w-8 shrink-0" />}
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </TooltipProvider>
        )}
      </div>

      {/* Bảng chi tiết */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Chi tiết theo công đoạn</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Snapshot hiện tại (đang chứa / đang làm / rework / lỗi) · throughput theo kỳ (hoàn thành / thời gian TB)
          </p>
        </div>
        <div className="overflow-x-auto border-t border-border">
          {loading && !data ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-6 rounded bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/40 text-[11px] tracking-wide font-medium text-muted-foreground">
                  <th className="sticky left-0 bg-muted/40 text-left px-4 py-2.5 min-w-[180px] border-b border-border">
                    Công đoạn
                  </th>
                  <th className="text-right px-3 py-2.5 border-b border-border">Đang chứa</th>
                  <th className="text-right px-3 py-2.5 border-b border-border">Chờ nhận</th>
                  <th className="text-right px-3 py-2.5 border-b border-border">Đang làm</th>
                  <th className="text-right px-3 py-2.5 border-b border-border">Rework</th>
                  <th className="text-right px-3 py-2.5 border-b border-border">Lỗi</th>
                  <th className="text-right px-3 py-2.5 border-b border-border">Hoàn thành (kỳ)</th>
                  <th className="text-right px-3 py-2.5 border-b border-border">Đã qua</th>
                  <th className="text-right px-3 py-2.5 border-b border-border">Time TB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stages.map((s) => {
                  const meta = STAGE_META[s.stage];
                  const Icon = meta?.icon ?? Clock;
                  const isBottleneck = totals?.bottleneckStage === s.stage && s.backlog > 0;
                  const cell = (v: number, cls?: string) => (
                    <td
                      className={cn('text-right px-3 py-2.5 tabular-nums', v === 0 ? 'text-muted-foreground/40' : cls)}
                    >
                      {v === 0 ? '–' : formatNumber(v)}
                    </td>
                  );
                  return (
                    <tr
                      key={s.stage}
                      className={cn(
                        'hover:bg-muted/30 transition-colors',
                        isBottleneck && 'bg-amber-50/40 dark:bg-amber-500/5',
                      )}
                    >
                      <td className="sticky left-0 bg-card px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Icon size={15} className="text-primary shrink-0" />
                          <span className="font-medium text-foreground">{s.label}</span>
                          {isBottleneck && (
                            <span className="text-[9px] uppercase tracking-wide font-semibold text-amber-600 bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 rounded">
                              tắc
                            </span>
                          )}
                        </div>
                      </td>
                      {cell(s.backlog, 'font-semibold text-foreground')}
                      {cell(s.waitingToStart, 'text-sky-700 dark:text-sky-300')}
                      {cell(s.inProgress, 'text-indigo-700 dark:text-indigo-300')}
                      {cell(s.rework, 'text-amber-700 dark:text-amber-300')}
                      {cell(s.error, 'text-rose-700 dark:text-rose-300')}
                      {cell(s.doneInRange, 'text-emerald-700 dark:text-emerald-300')}
                      {cell(s.passedTotal, 'text-muted-foreground')}
                      <td className="text-right px-3 py-2.5 tabular-nums text-muted-foreground">
                        {formatDuration(s.avgWorkMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Biểu đồ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Tồn đọng theo công đoạn</h2>
          <p className="text-xs text-muted-foreground mb-4">Số đơn đang chờ · đang làm · rework · lỗi tại mỗi chặng</p>
          {loading && !data ? (
            <div className="h-[300px] rounded bg-muted/40 animate-pulse" />
          ) : barData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
              Chưa có dữ liệu.
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={56} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip content={<BarTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                  <Bar dataKey="Đang chứa" stackId="a" fill={SEGMENT_COLORS.backlog} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Đang làm" stackId="a" fill={SEGMENT_COLORS.inProgress} />
                  <Bar dataKey="Rework" stackId="a" fill={SEGMENT_COLORS.rework} />
                  <Bar dataKey="Lỗi" stackId="a" fill={SEGMENT_COLORS.error} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-3 justify-center">
            {[
              ['Đang chứa', SEGMENT_COLORS.backlog],
              ['Đang làm', SEGMENT_COLORS.inProgress],
              ['Rework', SEGMENT_COLORS.rework],
              ['Lỗi', SEGMENT_COLORS.error],
            ].map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Đơn hoàn thành mỗi ngày</h2>
          <p className="text-xs text-muted-foreground mb-4">Số đơn đóng hàng xong theo ngày trong kỳ</p>
          {loading && !data ? (
            <div className="h-[300px] rounded bg-muted/40 animate-pulse" />
          ) : lineData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
              Chưa có đơn nào hoàn thành trong kỳ.
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip content={<LineTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#6366f1' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className={cn('h-px transition-opacity', isRefetching ? 'opacity-100' : 'opacity-0')} />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum: number, p: { value?: number }) => sum + (p.value || 0), 0);
  return (
    <div className="bg-popover border border-border rounded-md shadow-md p-2.5 text-xs min-w-[140px]">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <p key={p.name} className="flex items-center justify-between gap-3 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="tabular-nums font-medium text-foreground">{p.value}</span>
        </p>
      ))}
      <p className="flex items-center justify-between gap-3 mt-1.5 pt-1.5 border-t border-border text-foreground font-medium">
        <span>Tổng</span>
        <span className="tabular-nums">{total}</span>
      </p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LineTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md shadow-md p-2.5 text-xs">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-muted-foreground tabular-nums">{payload[0].value} đơn hoàn thành</p>
    </div>
  );
}
