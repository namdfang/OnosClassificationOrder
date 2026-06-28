import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  ListChecks,
  MousePointerClick,
  PlayCircle,
  RefreshCw,
  RotateCw,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { FulfillmentTaskTab, FulfillmentTransitionDto, ProductionOrder } from 'shared';
import {
  FULFILLMENT_STAGE_LABELS,
  FulfillmentStage,
  FulfillmentStageStatus,
  FulfillmentTransitionAction,
} from 'shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { SelectFilter } from '@/components/common/SelectFilter';
import { Spinner } from '@/components/common/Spinner';
import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog';
import { useDebounce } from '@/hooks/useDebounce';
import { RepositoryRemote } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { FulfillmentTaskCard } from './FulfillmentTaskCard';
import { ReworkBackDialog } from './ReworkBackDialog';

/**
 * Kanban 4 cột cho user Fulfillment — đồng bộ visual + UX với
 * `pages/designer/my-tasks` (header / KPI / hint / filter / kanban / sticky bulk).
 *
 * Khác Designer:
 *   - Cột "watching" thay vì "done" — read-only, không drag, không bulk.
 *   - DnD chỉ enable: waiting/rework → in-progress = action `start`.
 *   - Bulk actions:
 *     - Cùng cột waiting/rework → "Bắt đầu" (loop transition start).
 *     - Cùng cột in-progress → "Hoàn thành" (loop transition complete).
 *     - Rework-back KHÔNG bulk (cần dialog input lý do per đơn).
 *   - Filter facets derive client-side từ data đã load (không gọi BE
 *     `myTaskFilters` riêng vì queue per stage < 200 đơn).
 */
// 4 cột chính trong kanban: waiting / in-progress / rework / done.
// `watching` không phải column kanban → render qua drawer "Đơn đã đẩy về xử lý"
// ở dưới (clone pattern Designer's "Đơn đã trả lại").
type ColKey = 'waiting' | 'in-progress' | 'rework' | 'done';

type Columns = Record<ColKey, ProductionOrder[]>;

const EMPTY_COLS: Columns = { waiting: [], 'in-progress': [], rework: [], done: [] };

const COL_ORDER: ColKey[] = ['waiting', 'in-progress', 'rework', 'done'];

type BulkAction = 'start' | 'complete';

const COL_META: Record<
  ColKey,
  {
    label: string;
    icon: React.ElementType;
    accent: string;
    kpiAccent: string;
    bulk: BulkAction[];
  }
> = {
  waiting: {
    label: 'Đang chờ',
    icon: Clock,
    accent: 'border-zinc-300 dark:border-zinc-700',
    kpiAccent: 'text-zinc-700 dark:text-zinc-200',
    bulk: ['start'],
  },
  'in-progress': {
    label: 'Đang làm',
    icon: PlayCircle,
    accent: 'border-indigo-300 dark:border-indigo-700',
    kpiAccent: 'text-indigo-600',
    bulk: ['complete'],
  },
  rework: {
    label: 'Làm lại',
    icon: RotateCw,
    accent: 'border-amber-300 dark:border-amber-700',
    kpiAccent: 'text-amber-600',
    bulk: ['start'],
  },
  done: {
    label: 'Đã xong',
    icon: CheckCircle2,
    accent: 'border-emerald-300 dark:border-emerald-700',
    kpiAccent: 'text-emerald-600',
    bulk: [],
  },
};

type Filters = {
  type: string;
  fabricType: string;
  machineNumber: string;
  toolResult: string;
  userSku: string;
};

const EMPTY_FILTERS: Filters = {
  type: '',
  fabricType: '',
  machineNumber: '',
  toolResult: '',
  userSku: '',
};

/**
 * Size ordering chuẩn theo nội bộ. Lowercase compare để chấp nhận biến thể
 * (xxl ↔ 2XL, xxxl ↔ 3XL). Unknown → 99 (đẩy về cuối, vẫn ổn định).
 */
const SIZE_RANK: Record<string, number> = {
  xs: 0,
  s: 1,
  m: 2,
  l: 3,
  xl: 4,
  '2xl': 5,
  xxl: 5,
  '3xl': 6,
  xxxl: 6,
  '4xl': 7,
  xxxxl: 7,
  '5xl': 8,
  xxxxxl: 8,
  '6xl': 9,
  '7xl': 10,
  '8xl': 11,
};
function sizeRank(raw?: string): number {
  if (!raw) return 99;
  return SIZE_RANK[raw.trim().toLowerCase()] ?? 99;
}

export default function FulfillmentMyTasksPage() {
  const profile = useAuthStore((s) => s.profile);
  const myStage = profile?.fulfillmentStage as FulfillmentStage | undefined;

  const [columns, setColumns] = useState<Columns>(EMPTY_COLS);
  // Đơn user đã rework-back, đang chờ quay lại — render ở drawer dưới kanban
  // (giống pattern Designer's "Đơn đã trả lại").
  const [watching, setWatching] = useState<ProductionOrder[]>([]);
  const [showWatching, setShowWatching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reworkOrder, setReworkOrder] = useState<ProductionOrder | null>(null);
  const [activeOrder, setActiveOrder] = useState<ProductionOrder | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string; original?: string } | null>(
    null,
  );

  // ─── Filter state ──────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Date range gửi xuống BE — match scope `OrderFactoryTab` (7 ngày). undefined
  // = chưa pick → BE default 7 ngày. Empty string sau khi user clear =
  // all-time. Render: nếu undefined → init 7d window để DateRangePicker show.
  const init7d = useMemo(() => {
    const d = new Date();
    const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const from = new Date(d);
    from.setDate(from.getDate() - 6);
    const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    return { from: fromStr, to };
  }, []);
  const [dateFrom, setDateFrom] = useState<string>(init7d.from);
  const [dateTo, setDateTo] = useState<string>(init7d.to);
  // "Đã copy search" — giữ trạng thái cho đến khi user đổi value hoặc F5.
  // Reset khi search thay đổi (gồm cả case clear) — đồng bộ ý nghĩa "icon
  // tick = giá trị này đã được copy".
  const [searchCopied, setSearchCopied] = useState(false);
  useEffect(() => {
    setSearchCopied(false);
  }, [search]);

  // productionId card đã copy gần nhất — chỉ 1 card được tick tại 1 thời điểm
  // (copy card khác sẽ reset card cũ). Persist cho đến khi F5.
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  // Order chi tiết — mở qua click productionId trên card. Reuse component
  // OrderDetailDialog (đã wire link mockup/design dạng URL + cuttingFile preview).
  const [detailOrder, setDetailOrder] = useState<{ id: string; productionId: string } | null>(null);
  const handleCopyProductionId = async (order: ProductionOrder) => {
    try {
      await navigator.clipboard.writeText(order.productionId);
      setCopiedOrderId(order._id);
    } catch {
      toast.error('Không copy được — trình duyệt chặn clipboard');
    }
  };

  // ─── Selection state ───────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<{ colKey: ColKey; id: string } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = useCallback(async () => {
    if (!myStage) return;
    setLoading(true);
    try {
      // Truyền date range cho BE — match scope `OrderFactoryTab`. Empty string
      // = user clear → BE coi là explicit "all-time".
      const dateParams = { createdFrom: dateFrom, createdTo: dateTo };
      const [w, ip, rw, dn, wt] = await Promise.all([
        RepositoryRemote.fulfillment.myTasks({ tab: 'waiting', size: 100, ...dateParams }),
        RepositoryRemote.fulfillment.myTasks({ tab: 'in-progress', size: 100, ...dateParams }),
        RepositoryRemote.fulfillment.myTasks({ tab: 'rework', size: 100, ...dateParams }),
        RepositoryRemote.fulfillment.myTasks({ tab: 'done', size: 100, ...dateParams }),
        RepositoryRemote.fulfillment.myTasks({ tab: 'watching', size: 100, ...dateParams }),
      ]);
      setColumns({
        waiting: w.data.data ?? [],
        'in-progress': ip.data.data ?? [],
        rework: rw.data.data ?? [],
        done: dn.data.data ?? [],
      });
      setWatching(wt.data.data ?? []);
      setSelected(new Set());
      lastClickedRef.current = null;
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  }, [myStage, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  // ─── Filter application (client-side) ──────────────────────────
  const filteredColumns = useMemo<Columns>(() => {
    // Date filter giờ chạy BE (xem `load()`) — không filter date ở FE nữa.
    const q = debouncedSearch.trim().toLowerCase();
    const apply = (arr: ProductionOrder[]) =>
      arr.filter((o) => {
        if (q) {
          const hit =
            o.productionId?.toLowerCase().includes(q) || o.orderId?.toLowerCase().includes(q);
          if (!hit) return false;
        }
        if (filters.type && o.type !== filters.type) return false;
        if (filters.fabricType && o.fabricType !== filters.fabricType) return false;
        if (filters.machineNumber && o.machineNumber !== filters.machineNumber) return false;
        if (filters.toolResult && o.toolResult !== filters.toolResult) return false;
        if (filters.userSku && o.userSku !== filters.userSku) return false;
        return true;
      });
    return {
      waiting: apply(columns.waiting),
      'in-progress': apply(columns['in-progress']),
      rework: apply(columns.rework),
      done: apply(columns.done),
    };
  }, [columns, debouncedSearch, filters]);

  const filteredWatching = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return watching.filter((o) => {
      if (q) {
        const hit =
          o.productionId?.toLowerCase().includes(q) || o.orderId?.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (filters.type && o.type !== filters.type) return false;
      if (filters.fabricType && o.fabricType !== filters.fabricType) return false;
      if (filters.machineNumber && o.machineNumber !== filters.machineNumber) return false;
      if (filters.toolResult && o.toolResult !== filters.toolResult) return false;
      if (filters.userSku && o.userSku !== filters.userSku) return false;
      return true;
    });
  }, [watching, debouncedSearch, filters]);

  // ─── Facet options (count theo data đã filter trừ facet hiện tại) ──
  // Giống pattern faceted search ở Designer — count phản ánh kết quả khi áp
  // các filter khác (exclude own facet). Tính client-side vì queue nhỏ.
  const filterOptions = useMemo(() => {
    const all: ProductionOrder[] = [
      ...columns.waiting,
      ...columns['in-progress'],
      ...columns.rework,
      ...columns.done,
      ...watching,
    ];
    const facetFor = (
      key: keyof Filters,
      getter: (o: ProductionOrder) => string | undefined,
    ): { value: string; label: string; count: number }[] => {
      const filtered = all.filter((o) => {
        if (key !== 'type' && filters.type && o.type !== filters.type) return false;
        if (key !== 'fabricType' && filters.fabricType && o.fabricType !== filters.fabricType)
          return false;
        if (
          key !== 'machineNumber' &&
          filters.machineNumber &&
          o.machineNumber !== filters.machineNumber
        )
          return false;
        if (key !== 'toolResult' && filters.toolResult && o.toolResult !== filters.toolResult)
          return false;
        if (key !== 'userSku' && filters.userSku && o.userSku !== filters.userSku) return false;
        return true;
      });
      const counts = new Map<string, number>();
      for (const o of filtered) {
        const v = getter(o);
        if (!v) continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count);
    };
    return {
      type: facetFor('type', (o) => o.type),
      fabricType: facetFor('fabricType', (o) => o.fabricType),
      machineNumber: facetFor('machineNumber', (o) => o.machineNumber),
      toolResult: facetFor('toolResult', (o) => o.toolResult),
      userSku: facetFor('userSku', (o) => o.userSku),
    };
  }, [columns, watching, filters]);

  // ─── Transition + bulk ────────────────────────────────────────
  const callTransition = async (
    order: ProductionOrder,
    action: FulfillmentTransitionAction,
    body?: Pick<FulfillmentTransitionDto, 'target' | 'reason'>,
  ) => {
    if (!myStage) return;
    try {
      await RepositoryRemote.fulfillment.transition(order._id, {
        stage: myStage,
        action,
        ...body,
      } as FulfillmentTransitionDto);
      toast.success(actionToastLabel(action));
      void load();
    } catch (err) {
      handleAxiosError(err);
      void load();
    }
  };

  /** Bulk: loop transition per id song song. Không có BE bulk endpoint (queue nhỏ
   *  + business rule per-stage độc lập). Aggregate kết quả → 1 toast. */
  const callBulk = async (action: BulkAction) => {
    if (!myStage || selected.size === 0) return;
    const ids = Array.from(selected);
    const txAction =
      action === 'start' ? FulfillmentTransitionAction.Start : FulfillmentTransitionAction.Complete;
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          RepositoryRemote.fulfillment.transition(id, {
            stage: myStage,
            action: txAction,
          } as FulfillmentTransitionDto),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (fail === 0) toast.success(`Đã ${actionLabelInfinitive(action)} ${ok} đơn`);
      else toast.warning(`Đã ${actionLabelInfinitive(action)} ${ok}/${results.length} đơn (${fail} lỗi)`);
      void load();
    } catch (err) {
      handleAxiosError(err);
      void load();
    }
  };

  // ─── DnD ──────────────────────────────────────────────────────
  const handleDragStart = (e: DragStartEvent) => {
    const id = e.active.id as string;
    const card =
      filteredColumns.waiting.find((o) => o._id === id) ||
      filteredColumns.rework.find((o) => o._id === id);
    if (card) setActiveOrder(card);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveOrder(null);
    const orderId = e.active.id as string;
    const fromCol = (e.active.data.current as { col?: ColKey } | undefined)?.col;
    const toCol = e.over?.id as ColKey | undefined;
    if (!fromCol || !toCol || fromCol === toCol) return;

    if (toCol !== 'in-progress' || (fromCol !== 'waiting' && fromCol !== 'rework')) {
      toast.warning(
        'Chỉ kéo được "Đang chờ" / "Làm lại" sang "Đang làm". Đơn hoàn thành dùng nút "Hoàn thành"; báo lỗi dùng nút "Báo lỗi".',
      );
      return;
    }

    const order =
      columns[fromCol].find((o) => o._id === orderId) || ({ _id: orderId } as ProductionOrder);
    setColumns((prev) => ({
      ...prev,
      [fromCol]: prev[fromCol].filter((o) => o._id !== orderId),
      'in-progress': [order, ...prev['in-progress']],
    }));
    void callTransition(order, FulfillmentTransitionAction.Start);
  };

  // ─── Selection helpers ────────────────────────────────────────
  const orderedIdsPerColumn = useMemo(() => {
    const out: Record<ColKey, string[]> = { waiting: [], 'in-progress': [], rework: [], done: [] };
    for (const k of COL_ORDER) {
      const groups = groupByType(filteredColumns[k]);
      for (const [, rows] of groups) for (const r of rows) out[k].push(r._id);
    }
    return out;
  }, [filteredColumns]);

  const toggleId = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleCardCheckbox = (
    colKey: ColKey,
    id: string,
    checked: boolean,
    withShift: boolean,
  ) => {
    if (
      withShift &&
      lastClickedRef.current &&
      lastClickedRef.current.colKey === colKey &&
      lastClickedRef.current.id !== id
    ) {
      const arr = orderedIdsPerColumn[colKey];
      const a = arr.indexOf(lastClickedRef.current.id);
      const b = arr.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = from; i <= to; i++) {
            if (checked) next.add(arr[i]);
            else next.delete(arr[i]);
          }
          return next;
        });
        lastClickedRef.current = { colKey, id };
        return;
      }
    }
    toggleId(id, checked);
    lastClickedRef.current = { colKey, id };
  };

  const toggleGroup = (rows: ProductionOrder[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (checked) next.add(r._id);
        else next.delete(r._id);
      }
      return next;
    });
  };

  // Tính cột nào có ít nhất 1 đơn đã chọn → quyết định bulk action nào hợp lệ.
  const selectedColumns = useMemo(() => {
    const cols = new Set<ColKey>();
    for (const k of COL_ORDER) {
      for (const r of columns[k]) {
        if (selected.has(r._id)) {
          cols.add(k);
          break;
        }
      }
    }
    return cols;
  }, [selected, columns]);

  const bulkActions = useMemo<BulkAction[]>(() => {
    if (selectedColumns.size !== 1) return [];
    const [only] = [...selectedColumns];
    return COL_META[only].bulk;
  }, [selectedColumns]);

  if (!myStage) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Tài khoản chưa được gán <strong>Stage Fulfillment</strong>. Liên hệ Admin để gán.
      </div>
    );
  }

  const counts: Record<ColKey, number> = {
    waiting: filteredColumns.waiting.length,
    'in-progress': filteredColumns['in-progress'].length,
    rework: filteredColumns.rework.length,
    done: filteredColumns.done.length,
  };

  const onPreview = (url: string, title: string, original?: string) =>
    setPreview({ url, title, original });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
              <ListChecks size={20} className="text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Task của tôi — {FULFILLMENT_STAGE_LABELS[myStage]}
              </h1>
              <p className="text-xs text-muted-foreground">
                Xưởng: {profile?.factoryId ?? '—'}
              </p>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {COL_ORDER.map((k) => (
            <KPI key={k} label={COL_META[k].label} value={counts[k]} accent={COL_META[k].kpiAccent} />
          ))}
        </div>

        {/* Hint */}
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
          <MousePointerClick size={13} className="text-primary shrink-0 mt-0.5" />
          <div>
            <strong className="text-foreground">Mẹo chọn nhiều đơn:</strong> Tick checkbox cạnh tên
            sản phẩm để chọn toàn bộ đơn của sản phẩm đó. Hoặc tick 1 đơn, giữ{' '}
            <kbd className="px-1 bg-background border rounded">Shift</kbd> rồi click checkbox khác
            (trong cùng cột) để chọn nhanh tất cả đơn ở giữa. Kéo card "Đang chờ"/"Làm lại" sang
            "Đang làm" cũng được.
          </div>
        </div>

        {/* Filter bar — search + date trên 1 row, các facet ở row dưới */}
        <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
          {/* Row 1: Search (flex-1) + DateRangePicker */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                Search
              </label>
              <div className="relative mt-1">
                <button
                  type="button"
                  disabled={!search.trim()}
                  title={searchCopied ? 'Đã copy' : 'Copy giá trị search'}
                  onClick={async () => {
                    const v = search.trim();
                    if (!v) return;
                    try {
                      await navigator.clipboard.writeText(v);
                      setSearchCopied(true);
                    } catch {
                      toast.error('Không copy được — trình duyệt chặn clipboard');
                    }
                  }}
                  className={cn(
                    'absolute left-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded transition-colors',
                    search.trim()
                      ? searchCopied
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      : 'text-muted-foreground/40 cursor-not-allowed',
                  )}
                >
                  {searchCopied ? <CheckCircle2 size={13} /> : <Copy size={12} />}
                </button>
                <Search size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="productionId / orderId"
                  className="h-7 pl-8 pr-7 text-xs"
                />
              </div>
            </div>
            <div className="min-w-[200px]">
              {/* <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                Ngày vào sản xuất
              </label> */}
              <div className="mt-1">
                <DateRangePicker
                  from={dateFrom}
                  to={dateTo}
                  onChange={(f, t) => {
                    setDateFrom(f);
                    setDateTo(t);
                  }}
                  placeholder="Tất cả"
                />
              </div>
            </div>
          </div>

          {/* Row 2: 5 facet filters */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
            <SelectFilter
              label="Sản phẩm"
              value={filters.type}
              onChange={(v) => setFilters({ ...filters, type: v })}
              options={filterOptions.type}
            />
            <SelectFilter
              label="Loại vải"
              value={filters.fabricType}
              onChange={(v) => setFilters({ ...filters, fabricType: v })}
              options={filterOptions.fabricType}
            />
            <SelectFilter
              label="Máy"
              value={filters.machineNumber}
              onChange={(v) => setFilters({ ...filters, machineNumber: v })}
              options={filterOptions.machineNumber}
            />
            <SelectFilter
              label="Kết quả Tool"
              value={filters.toolResult}
              onChange={(v) => setFilters({ ...filters, toolResult: v })}
              options={filterOptions.toolResult}
            />
            <SelectFilter
              label="Khách hàng (SKU)"
              value={filters.userSku}
              onChange={(v) => setFilters({ ...filters, userSku: v })}
              options={filterOptions.userSku}
            />
          </div>
        </div>

        {/* Kanban */}
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {COL_ORDER.map((key) => (
              <Column
                key={key}
                colKey={key}
                cards={filteredColumns[key]}
                myStage={myStage}
                activeDragId={activeOrder?._id}
                selected={selected}
                copiedOrderId={copiedOrderId}
                onCopyProductionId={handleCopyProductionId}
                onClickProductionId={(o) => setDetailOrder({ id: o._id, productionId: o.productionId })}
                onStart={(o) => void callTransition(o, FulfillmentTransitionAction.Start)}
                onComplete={(o) => void callTransition(o, FulfillmentTransitionAction.Complete)}
                onReportError={(o) => setReworkOrder(o)}
                onPreview={onPreview}
                onCheckCard={(id, checked, withShift) =>
                  handleCardCheckbox(key, id, checked, withShift)
                }
                onCheckGroup={toggleGroup}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeOrder ? (
              <div className="rotate-1 shadow-2xl ring-2 ring-primary/40 rounded-md w-[260px] cursor-grabbing">
                <FulfillmentTaskCard order={activeOrder} myStage={myStage} colKey="waiting" />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {loading && (
          <div className="flex items-center justify-center p-4">
            <Spinner size={18} className="text-primary" />
          </div>
        )}

        {/* Watching drawer — đơn user đã đẩy về xử lý (rework-back), đang
            chờ quay lại. Clone pattern Designer's "Đơn đã trả lại". */}
        {/* <div className="rounded-md border border-border bg-card">
          <button
            type="button"
            onClick={() => setShowWatching((s) => !s)}
            className="w-full flex items-center justify-between p-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <ChevronRight size={13} /> Đơn đã đẩy về xử lý ({filteredWatching.length})
            </span>
            {showWatching ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showWatching && (
            <div className="p-3 pt-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {filteredWatching.length === 0 && (
                <p className="text-xs text-muted-foreground col-span-full italic">
                  Chưa đẩy đơn nào về xử lý.
                </p>
              )}
              {filteredWatching.map((o) => (
                <FulfillmentTaskCard
                  key={o._id}
                  order={o}
                  myStage={myStage}
                  colKey="watching"
                  onPreview={onPreview}
                />
              ))}
            </div>
          )}
        </div> */}

        {/* Sticky bulk toolbar */}
        {selected.size > 0 && (
          <div className="sticky bottom-3 z-30 flex justify-center px-4 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card shadow-lg px-4 py-2 flex-wrap">
              <CheckCircle2 size={14} className="text-primary" />
              <span className="text-sm">
                Đã chọn <span className="font-semibold">{selected.size}</span>
              </span>
              {selectedColumns.size > 1 ? (
                <span className="text-xs text-muted-foreground italic">
                  (Đơn ở nhiều cột — chỉ bulk cùng 1 cột)
                </span>
              ) : (
                <>
                  {bulkActions.includes('start') && (
                    <Button size="sm" onClick={() => callBulk('start')}>
                      <PlayCircle size={14} /> Bắt đầu
                    </Button>
                  )}
                  {bulkActions.includes('complete') && (
                    <Button size="sm" onClick={() => callBulk('complete')}>
                      <CheckCircle2 size={14} /> Hoàn thành
                    </Button>
                  )}
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                <X size={13} />
              </Button>
            </div>
          </div>
        )}

        {reworkOrder && (
          <ReworkBackDialog
            order={reworkOrder}
            myStage={myStage}
            onClose={() => setReworkOrder(null)}
            onSubmit={async (target, reason) => {
              await callTransition(reworkOrder, FulfillmentTransitionAction.ReworkBack, {
                target,
                reason,
              });
              setReworkOrder(null);
            }}
          />
        )}

        <ImagePreviewDialog
          open={!!preview}
          onOpenChange={(o) => !o && setPreview(null)}
          url={preview?.url}
          originalUrl={preview?.original}
          title={preview?.title}
        />

        <OrderDetailDialog
          open={!!detailOrder}
          onOpenChange={(o) => !o && setDetailOrder(null)}
          orderId={detailOrder?.id ?? null}
          productionId={detailOrder?.productionId}
        />
      </div>
    </TooltipProvider>
  );
}

function actionToastLabel(action: FulfillmentTransitionAction): string {
  switch (action) {
    case FulfillmentTransitionAction.Start:
      return 'Đã bắt đầu';
    case FulfillmentTransitionAction.Complete:
      return 'Đã hoàn thành';
    case FulfillmentTransitionAction.ReworkBack:
      return 'Đã đẩy về xử lý';
  }
}

function actionLabelInfinitive(action: BulkAction): string {
  return action === 'start' ? 'bắt đầu' : 'hoàn thành';
}

function KPI({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function groupByType(cards: ProductionOrder[]): [string, ProductionOrder[]][] {
  const map = new Map<string, ProductionOrder[]>();
  for (const r of cards) {
    const k = r.type || '— Chưa có type —';
    const arr = map.get(k) || [];
    arr.push(r);
    map.set(k, arr);
  }
  // Sort orders trong cùng 1 type theo size priority (S, M, L, XL, 2XL...).
  // Tiebreak: giữ thứ tự gốc (BE đã sort theo inProductionAt desc) — dùng
  // index gốc trong array làm secondary key qua `Array.prototype.sort` stable.
  for (const [, arr] of map) {
    arr.sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

interface ColumnProps {
  colKey: ColKey;
  cards: ProductionOrder[];
  myStage: FulfillmentStage;
  activeDragId?: string;
  selected: Set<string>;
  copiedOrderId: string | null;
  onCopyProductionId: (o: ProductionOrder) => void;
  onClickProductionId: (o: ProductionOrder) => void;
  onStart: (o: ProductionOrder) => void;
  onComplete: (o: ProductionOrder) => void;
  onReportError: (o: ProductionOrder) => void;
  onPreview: (url: string, title: string, original?: string) => void;
  onCheckCard: (id: string, checked: boolean, withShift: boolean) => void;
  onCheckGroup: (rows: ProductionOrder[], checked: boolean) => void;
}

function Column({
  colKey,
  cards,
  myStage,
  activeDragId,
  selected,
  copiedOrderId,
  onCopyProductionId,
  onClickProductionId,
  onStart,
  onComplete,
  onReportError,
  onPreview,
  onCheckCard,
  onCheckGroup,
}: ColumnProps) {
  const meta = COL_META[colKey];
  const Icon = meta.icon;
  const { setNodeRef, isOver } = useDroppable({ id: colKey });
  const groups = useMemo(() => groupByType(cards), [cards]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (type: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  // Cột done không có checkbox (đã xong rồi — không có bulk action).
  const showCheckbox = colKey !== 'done';

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border-2 bg-muted/30 p-2.5 transition-colors min-h-[200px] flex flex-col gap-2',
        meta.accent,
        isOver && 'bg-muted/60',
      )}
    >
      <div className="flex items-center justify-between text-xs font-semibold text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Icon size={13} /> {meta.label}
        </span>
        <span className="text-muted-foreground">{cards.length}</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto max-h-[calc(100vh-380px)]">
        {cards.length === 0 && (
          <div className="text-[11px] text-muted-foreground italic text-center py-6">Trống</div>
        )}
        {groups.map(([type, rows]) => {
          const selCount = rows.filter((r) => selected.has(r._id)).length;
          const allChecked = rows.length > 0 && selCount === rows.length;
          const indeterminate = selCount > 0 && !allChecked;
          const isCollapsed = collapsed.has(type);
          return (
            <div key={type} className="space-y-1.5">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleCollapse(type)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCollapse(type);
                  }
                }}
                className="flex items-center gap-2 px-1.5 py-1 rounded bg-card/60 text-[11px] font-medium text-foreground cursor-pointer hover:bg-card select-none"
                title={isCollapsed ? 'Click để mở' : 'Click để thu gọn'}
              >
                {showCheckbox && (
                  <input
                    type="checkbox"
                    className="shrink-0 accent-indigo-500"
                    ref={(el) => {
                      if (el) el.indeterminate = indeterminate;
                    }}
                    checked={allChecked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onCheckGroup(rows, e.target.checked)}
                  />
                )}
                {isCollapsed ? (
                  <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate" title={type}>
                  {type}
                </span>
                {showCheckbox && (
                  <span className="text-muted-foreground font-normal">
                    {selCount}/{rows.length}
                  </span>
                )}
                {!showCheckbox && (
                  <span className="text-muted-foreground font-normal">{rows.length}</span>
                )}
              </div>

              {!isCollapsed && (
                <div className="space-y-2 pl-2 pr-2 border-l-2 border-border/40 ml-2.5">
                  {rows.map((o) => {
                    const checked = selected.has(o._id);
                    const isDragging = activeDragId === o._id;
                    return (
                      <div
                        key={o._id}
                        className={cn('relative group', isDragging && 'opacity-30')}
                      >
                        {showCheckbox && (
                          <div className="absolute top-1.5 left-1.5 z-10">
                            <input
                              type="checkbox"
                              checked={checked}
                              onClick={(e) => {
                                const me = e.nativeEvent as MouseEvent;
                                (e.currentTarget as HTMLInputElement & {
                                  __shift?: boolean;
                                }).__shift = me.shiftKey;
                              }}
                              onChange={(e) => {
                                const ws =
                                  ((e.currentTarget as HTMLInputElement & { __shift?: boolean })
                                    .__shift) || false;
                                onCheckCard(o._id, e.currentTarget.checked, ws);
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              className="w-3.5 h-3.5 accent-indigo-500"
                            />
                          </div>
                        )}

                        <div
                          className={
                            checked
                              ? 'rounded-md ring-1 ring-indigo-400/70 bg-indigo-50/40 dark:bg-indigo-500/5 transition-colors'
                              : 'transition-colors'
                          }
                        >
                          <FulfillmentTaskCard
                            order={o}
                            myStage={myStage}
                            colKey={colKey}
                            isCopied={copiedOrderId === o._id}
                            onCopyProductionId={() => onCopyProductionId(o)}
                            onClickProductionId={() => onClickProductionId(o)}
                            onPreview={onPreview}
                            onStart={() => onStart(o)}
                            onComplete={() => onComplete(o)}
                            onReportError={() => onReportError(o)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
