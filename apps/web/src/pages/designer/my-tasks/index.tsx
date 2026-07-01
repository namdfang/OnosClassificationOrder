import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ListChecks,
  MousePointerClick,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import type { DesignerMyStats, DesignerTaskCard, DesignerTransitionDto } from 'shared';
import { DesignerStatus, DesignerTransitionAction, WorkshopConfigCategory } from 'shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { SelectFilter } from '@/components/common/SelectFilter';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { useDebounce } from '@/hooks/useDebounce';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';

import { DailyBreakdownPanel } from './DailyBreakdownPanel';
import { RejectModal } from './RejectModal';
import { TaskCard } from './TaskCard';
import { TaskDetailDialog } from './TaskDetailDialog';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type ColKey = 'assigned' | 'rework' | 'inProgress' | 'done';

type Columns = Record<ColKey, DesignerTaskCard[]>;

const EMPTY_COLS: Columns = { assigned: [], rework: [], inProgress: [], done: [] };

// THỨ TỰ CỘT yêu cầu: Cần làm → Cần làm lại → Đang làm → Đã xong
const COL_ORDER: ColKey[] = ['assigned', 'rework', 'inProgress', 'done'];

const COL_META: Record<
  ColKey,
  { label: string; status: DesignerStatus; accent: string; bulk: DesignerTransitionAction[] }
> = {
  assigned: {
    label: 'Cần làm',
    status: DesignerStatus.Assigned,
    accent: 'border-zinc-300 dark:border-zinc-700',
    bulk: [DesignerTransitionAction.Start, DesignerTransitionAction.Reject],
  },
  rework: {
    label: 'Cần làm lại',
    status: DesignerStatus.Rework,
    accent: 'border-amber-300 dark:border-amber-700',
    bulk: [DesignerTransitionAction.Restart],
  },
  inProgress: {
    label: 'Đang làm',
    status: DesignerStatus.InProgress,
    accent: 'border-indigo-300 dark:border-indigo-700',
    bulk: [DesignerTransitionAction.Complete, DesignerTransitionAction.Reject],
  },
  done: {
    label: 'Đã xong',
    status: DesignerStatus.Done,
    accent: 'border-emerald-300 dark:border-emerald-700',
    bulk: [],
  },
};

const COL_BY_STATUS: Partial<Record<DesignerStatus, ColKey>> = {
  [DesignerStatus.Assigned]: 'assigned',
  [DesignerStatus.Rework]: 'rework',
  [DesignerStatus.InProgress]: 'inProgress',
  [DesignerStatus.Done]: 'done',
};

type FilterOption = { value: string; label: string; count: number };

type Filters = {
  type: string;
  fabricType: string;
  machineNumber: string;
  toolResult: string;
  toolResultNote: string;
  userSku: string;
  /** CSV các mã file sửa lỗi đã chọn (multi-select). Field mảng trên order. */
  errorFile: string;
};

const EMPTY_FILTERS: Filters = {
  type: '',
  fabricType: '',
  machineNumber: '',
  toolResult: '',
  toolResultNote: '',
  userSku: '',
  errorFile: '',
};

/** Drag rules: từ status `from` sang cột `to` ⇒ action gì (hoặc null). */
function planTransition(
  from: DesignerStatus,
  to: ColKey,
): { action: DesignerTransitionAction; needsReason?: boolean } | null {
  const target = COL_META[to].status;
  if (target === from) return null;
  if (target === DesignerStatus.InProgress) {
    if (from === DesignerStatus.Assigned) return { action: DesignerTransitionAction.Start };
    if (from === DesignerStatus.Rework) return { action: DesignerTransitionAction.Restart };
  }
  if (target === DesignerStatus.Done && from === DesignerStatus.InProgress) {
    return { action: DesignerTransitionAction.Complete };
  }
  return null;
}

export default function MyTasksPage() {
  const [columns, setColumns] = useState<Columns>(EMPTY_COLS);
  const [rejected, setRejected] = useState<DesignerTaskCard[]>([]);
  const [showRejected, setShowRejected] = useState(false);
  const [stats, setStats] = useState<DesignerMyStats | null>(null);
  // Bộ lọc ngày theo `inProductionAt` (kanban 4 cột + facet counts). Mặc định
  // 7 ngày gần nhất. Lưu vào URL params (`from`/`to`) để F5 giữ lựa chọn.
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateFrom, setDateFrom] = useState<string>(() => searchParams.get('from') || daysAgoISO(6));
  const [dateTo, setDateTo] = useState<string>(() => searchParams.get('to') || todayISO());
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState<string | undefined>(undefined);

  // Filter bar cũng lưu vào URL params để F5 giữ lựa chọn (đọc 1 lần khi mount).
  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    type: searchParams.get('type') || '',
    fabricType: searchParams.get('fabricType') || '',
    machineNumber: searchParams.get('machineNumber') || '',
    toolResult: searchParams.get('toolResult') || '',
    toolResultNote: searchParams.get('toolResultNote') || '',
    userSku: searchParams.get('userSku') || '',
    errorFile: searchParams.get('errorFile') || '',
  }));
  const [filterOptions, setFilterOptions] = useState<{
    type: FilterOption[];
    fabricType: FilterOption[];
    machineNumber: FilterOption[];
    toolResult: FilterOption[];
    toolResultNote: FilterOption[];
    userSku: FilterOption[];
    errorFile: FilterOption[];
  }>({ type: [], fabricType: [], machineNumber: [], toolResult: [], toolResultNote: [], userSku: [], errorFile: [] });

  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const debouncedSearch = useDebounce(search, 300);

  // Selection state — global Set chứa tất cả id đã chọn. Bulk action chỉ
  // valid khi tất cả id đã chọn nằm trong CÙNG 1 cột status.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [rejectTarget, setRejectTarget] = useState<DesignerTaskCard | null>(null);
  const [bulkReject, setBulkReject] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string; original?: string } | null>(null);

  // ID + cardSnapshot of card đang drag — render trong DragOverlay để
  // visible khi kéo qua cột khác.
  const [activeCard, setActiveCard] = useState<DesignerTaskCard | null>(null);

  const lastClickedRef = useRef<{ colKey: ColKey; id: string } | null>(null);

  // Seq guard chống race: khi đổi ngày/filter liên tiếp, nhiều request chạy
  // song song. Mạng không đảm bảo thứ tự trả về → response cũ về muộn có thể
  // ghi đè data mới. Mỗi fetch tăng seq, chỉ response của request MỚI NHẤT
  // (seq khớp ref) mới được áp dụng.
  const tasksSeqRef = useRef(0);
  const filtersSeqRef = useRef(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const fetchTasks = async () => {
    const seq = ++tasksSeqRef.current;
    try {
      setLoading(true);
      const res = await RepositoryRemote.designer.myTasks({
        ...filters,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        search: debouncedSearch || undefined,
      });
      // Response cũ đến muộn → bỏ qua, không ghi đè data của request mới hơn.
      if (seq !== tasksSeqRef.current) return;
      const data = res.data?.data as {
        columns: Columns;
        rejected: DesignerTaskCard[];
        fullName?: string;
      } | undefined;
      setColumns(data?.columns || EMPTY_COLS);
      setRejected(data?.rejected || []);
      setFullName(data?.fullName);
      setSelected(new Set());
      lastClickedRef.current = null;
    } catch (err) {
      if (seq === tasksSeqRef.current) handleAxiosError(err);
    } finally {
      if (seq === tasksSeqRef.current) setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await RepositoryRemote.designer.myStats({
        period: 'custom',
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setStats((res.data?.data || null) as DesignerMyStats | null);
    } catch (err) {
      handleAxiosError(err);
    }
  };

  const fetchFilters = async () => {
    const seq = ++filtersSeqRef.current;
    try {
      const res = await RepositoryRemote.designer.myTaskFilters({
        ...filters,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      // Response cũ đến muộn → bỏ qua (tránh facet count lệch với data đang hiện).
      if (seq !== filtersSeqRef.current) return;
      // Merge với default rỗng → mọi key luôn là array kể cả khi response BE
      // thiếu facet nào đó (vd. backend cũ chưa có `userSku`) → tránh crash.
      const empty = { type: [], fabricType: [], machineNumber: [], toolResult: [], toolResultNote: [], userSku: [], errorFile: [] };
      setFilterOptions({ ...empty, ...(res.data?.data || {}) } as typeof filterOptions);
    } catch (err) {
      if (seq === filtersSeqRef.current) handleAxiosError(err);
    }
  };

  // Sync ngày + toàn bộ filter bar (+ search) → URL params để F5 giữ lựa chọn.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        const setOrDel = (k: string, v: string) => (v ? sp.set(k, v) : sp.delete(k));
        setOrDel('from', dateFrom);
        setOrDel('to', dateTo);
        setOrDel('type', filters.type);
        setOrDel('fabricType', filters.fabricType);
        setOrDel('machineNumber', filters.machineNumber);
        setOrDel('toolResult', filters.toolResult);
        setOrDel('toolResultNote', filters.toolResultNote);
        setOrDel('userSku', filters.userSku);
        setOrDel('errorFile', filters.errorFile);
        setOrDel('search', debouncedSearch);
        return sp;
      },
      { replace: true },
    );
  }, [dateFrom, dateTo, filters, debouncedSearch, setSearchParams]);

  useEffect(() => {
    fetchTasks();
    fetchFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.type, filters.fabricType, filters.machineNumber, filters.toolResult, filters.toolResultNote, filters.userSku, filters.errorFile, debouncedSearch, dateFrom, dateTo]);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // Nạp workshop_config (1 lần) để TaskCard + filter bar resolve label (name)
  // thay vì hiển thị raw code (đồng bộ với bảng đơn).
  const loadWorkshopConfig = useWorkshopConfigStore((s) => s.load);
  useEffect(() => {
    loadWorkshopConfig();
  }, [loadWorkshopConfig]);

  // Subscribe byCategory để re-render khi config load xong; map option.value
  // (code) → name cho dropdown filter. Giữ nguyên value (code) để gửi xuống BE.
  const byCategory = useWorkshopConfigStore((s) => s.byCategory);
  const labelOpts = (cat: WorkshopConfigCategory, opts: FilterOption[]): FilterOption[] =>
    opts.map((o) => ({
      ...o,
      label: byCategory[cat]?.find((i) => i.code === o.value)?.name || o.label,
    }));

  // Bump để DailyBreakdownPanel refetch mỗi khi kanban đổi (transition/refresh)
  // → số liệu theo ngày luôn đồng bộ với kanban.
  const [breakdownToken, setBreakdownToken] = useState(0);

  const refreshAll = () => {
    fetchTasks();
    fetchFilters();
    fetchStats();
    setBreakdownToken((t) => t + 1);
  };

  // Cho mỗi cột → ordered array của id (sau khi đã group by type, để
  // shift+click visual order khớp với DOM order).
  const orderedIdsPerColumn = useMemo(() => {
    const out: Record<ColKey, string[]> = { assigned: [], rework: [], inProgress: [], done: [] };
    for (const k of COL_ORDER) {
      const groups = groupByType(columns[k]);
      for (const [, rows] of groups) for (const r of rows) out[k].push(r._id);
    }
    return out;
  }, [columns]);

  // ─── Selection helpers ─────────────────────────────────────────
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

  const toggleGroup = (rows: DesignerTaskCard[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (checked) next.add(r._id);
        else next.delete(r._id);
      }
      return next;
    });
  };

  // Tính status của các đơn đã chọn — để biết bulk action nào valid.
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

  const bulkActions = useMemo<DesignerTransitionAction[]>(() => {
    if (selectedColumns.size !== 1) return []; // mixed cols → no bulk
    const [only] = [...selectedColumns];
    return COL_META[only].bulk;
  }, [selectedColumns]);

  // ─── Drag handling ─────────────────────────────────────────────
  const callTransition = async (orderId: string, dto: DesignerTransitionDto) => {
    try {
      await RepositoryRemote.designer.transition(orderId, dto);
      toast.success('Cập nhật trạng thái');
      refreshAll();
    } catch (err) {
      handleAxiosError(err);
      fetchTasks();
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    const status = (event.active.data.current as { status?: DesignerStatus } | undefined)?.status;
    if (!status) return;
    const colKey = COL_BY_STATUS[status];
    if (!colKey) return;
    const card = columns[colKey].find((c) => c._id === id);
    if (card) setActiveCard(card);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCard(null);
    const cardId = event.active.id as string;
    const fromStatus = (event.active.data.current as { status?: DesignerStatus } | undefined)
      ?.status;
    const overId = event.over?.id as ColKey | undefined;
    if (!overId || !fromStatus || !COL_META[overId]) return;

    const plan = planTransition(fromStatus, overId);
    if (!plan) {
      const targetStatus = COL_META[overId].status;
      if (targetStatus === fromStatus) return;
      toast.warning(
        `Không chuyển được "${fromStatus}" → "${targetStatus}". Drag rules: Cần làm/Cần làm lại → Đang làm, Đang làm → Đã xong.`,
      );
      return;
    }
    moveCardOptimistic(cardId, fromStatus, overId);
    callTransition(cardId, { action: plan.action });
  };

  const moveCardOptimistic = (id: string, from: DesignerStatus, to: ColKey): void => {
    const fromKey = COL_BY_STATUS[from];
    if (!fromKey) return;
    setColumns((prev) => {
      const card = prev[fromKey].find((c) => c._id === id);
      if (!card) return prev;
      return {
        ...prev,
        [fromKey]: prev[fromKey].filter((c) => c._id !== id),
        [to]: [{ ...card, designerStatus: COL_META[to].status }, ...prev[to]],
      };
    });
  };

  // ─── Bulk actions ──────────────────────────────────────────────
  const callBulk = async (action: DesignerTransitionAction, reason?: string) => {
    if (selected.size === 0) return;
    try {
      const ids = Array.from(selected);
      const res = await RepositoryRemote.designer.bulkTransition({ ids, action, reason });
      const data = res.data?.data as {
        matched: number;
        modified: number;
        skipped: { orderId: string; productionId: string; reason: string }[];
      };
      const msg = `Cập nhật ${data.modified}/${data.matched}`;
      if (data.skipped.length === 0) {
        toast.success(msg);
      } else {
        toast.warning(`${msg}. ${data.skipped.length} đơn bị skip`, { duration: 5000 });
        toast.message('Đơn bị skip', {
          description: data.skipped
            .slice(0, 5)
            .map((s) => `• ${s.productionId}: ${s.reason}`)
            .join('\n'),
          duration: 9000,
        });
      }
      refreshAll();
    } catch (err) {
      handleAxiosError(err);
    }
  };

  const handleBulkReject = (reason: string) => {
    callBulk(DesignerTransitionAction.Reject, reason);
    setBulkReject(false);
  };

  const handleSingleReject = async (reason: string) => {
    if (!rejectTarget) return;
    try {
      await RepositoryRemote.designer.transition(rejectTarget._id, {
        action: DesignerTransitionAction.Reject,
        reason: reason || undefined,
      });
      toast.success('Đã trả lại task');
      setRejectTarget(null);
      refreshAll();
    } catch (err) {
      handleAxiosError(err);
    }
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
                Xin chào{fullName ? `, ${fullName}` : ''}
              </h1>
              <p className="text-xs text-muted-foreground">
                Kéo thả card để chuyển trạng thái, hoặc tick checkbox để bulk update.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              clearable={false}
              onChange={(f, t) => {
                setDateFrom(f);
                setDateTo(t);
              }}
            />
            <Button variant="ghost" size="sm" onClick={refreshAll} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* KPI */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <KPI label="Cần làm" value={stats.assignedCount} accent="text-zinc-700 dark:text-zinc-200" />
            <KPI label="Cần làm lại" value={stats.reworkCount} accent="text-amber-600" />
            <KPI label="Đang làm" value={stats.inProgressCount} accent="text-indigo-600" />
            <KPI label="Đã xong" value={stats.completedInPeriod} accent="text-emerald-600" />
            <KPI label="Đã trả lại" value={stats.rejectedCount} accent="text-rose-600" />
            <KPI
              label="Phản hồi / làm"
              value={`${stats.avgResponseMin}' / ${stats.avgWorkMin}'`}
              accent="text-muted-foreground"
            />
          </div>
        )}

        {/* Chi tiết theo ngày — panel focus đơn chưa xong (7/14/30 ngày).
            Click 1 ngày → lọc kanban về đúng ngày đó. */}
        <DailyBreakdownPanel
          selectedDay={dateFrom && dateFrom === dateTo ? dateFrom : undefined}
          onPickDay={(day) => {
            setDateFrom(day);
            setDateTo(day);
          }}
          reloadToken={breakdownToken}
        />

        {/* Hint */}
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
          <MousePointerClick size={13} className="text-primary shrink-0 mt-0.5" />
          <div>
            <strong className="text-foreground">Mẹo chọn nhiều đơn:</strong> Tick checkbox cạnh tên
            sản phẩm để chọn toàn bộ đơn của sản phẩm đó. Hoặc tick 1 đơn, giữ{' '}
            <kbd className="px-1 bg-background border rounded">Shift</kbd> rồi click checkbox khác
            (trong cùng cột) để chọn nhanh tất cả đơn ở giữa.
          </div>
        </div>

        {/* Filter bar */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-8 gap-2 rounded-md border border-border bg-card p-2.5">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Search
            </label>
            <div className="relative mt-1">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="productionId / orderId"
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
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
            options={labelOpts(WorkshopConfigCategory.FabricType, filterOptions.fabricType)}
          />
          <SelectFilter
            label="Máy"
            value={filters.machineNumber}
            onChange={(v) => setFilters({ ...filters, machineNumber: v })}
            options={labelOpts(WorkshopConfigCategory.Machine, filterOptions.machineNumber)}
          />
          <SelectFilter
            label="Kết quả Tool"
            value={filters.toolResult}
            onChange={(v) => setFilters({ ...filters, toolResult: v })}
            options={labelOpts(WorkshopConfigCategory.ToolResult, filterOptions.toolResult)}
          />
          <SelectFilter
            label="Note kq Tool"
            value={filters.toolResultNote}
            onChange={(v) => setFilters({ ...filters, toolResultNote: v })}
            options={labelOpts(WorkshopConfigCategory.ToolResultNote, filterOptions.toolResultNote)}
          />
          <SelectFilter
            label="Khách hàng"
            value={filters.userSku}
            onChange={(v) => setFilters({ ...filters, userSku: v })}
            options={filterOptions.userSku}
          />
          {/* File sửa lỗi — single-select (giống OrderTableWorkshop). Options lấy
              thẳng từ backend facet: `label` đã là name (resolve ở BE), không cần
              labelOpts/byCategory. Field mảng: BE lọc `$in` khớp đơn chứa mã đã chọn. */}
          <SelectFilter
            label="File sửa lỗi"
            value={filters.errorFile}
            onChange={(v) => setFilters({ ...filters, errorFile: v })}
            options={filterOptions.errorFile}
          />
        </div>

        {/* Kanban — cột rework chỉ render khi có task để dành chỗ cho 3 cột chính */}
        {(() => {
          const visibleCols = COL_ORDER.filter(
            (k) => k !== 'rework' || columns.rework.length > 0,
          );
          const gridCls =
            visibleCols.length === 4
              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3'
              : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3';
          return (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className={gridCls}>
                {visibleCols.map((key) => (
                  <Column
                    key={key}
                    colKey={key}
                    cards={columns[key]}
                    selected={selected}
                    activeDragId={activeCard?._id}
                    onCheckCard={(id, checked, withShift) =>
                      handleCardCheckbox(key, id, checked, withShift)
                    }
                    onCheckGroup={toggleGroup}
                    onClickId={(id) => setDetailId(id)}
                    onPreview={onPreview}
                    onRejectCard={(card) => setRejectTarget(card)}
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
                {activeCard ? (
                  <div className="rotate-1 shadow-2xl ring-2 ring-primary/40 rounded-md w-[260px] cursor-grabbing">
                    <TaskCard card={activeCard} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          );
        })()}

        {/* Rejected drawer */}
        <div className="rounded-md border border-border bg-card">
          <button
            type="button"
            onClick={() => setShowRejected((s) => !s)}
            className="w-full flex items-center justify-between p-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span>Đơn đã trả lại ({rejected.length})</span>
            {showRejected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showRejected && (
            <div className="p-3 pt-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {rejected.length === 0 && (
                <p className="text-xs text-muted-foreground col-span-full">Chưa trả lại đơn nào.</p>
              )}
              {rejected.map((c) => (
                <TaskCard key={c._id} card={c} onPreview={onPreview} />
              ))}
            </div>
          )}
        </div>

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
                  {bulkActions.includes(DesignerTransitionAction.Start) && (
                    <Button size="sm" onClick={() => callBulk(DesignerTransitionAction.Start)}>
                      <PlayCircle size={14} /> Nhận làm
                    </Button>
                  )}
                  {bulkActions.includes(DesignerTransitionAction.Restart) && (
                    <Button size="sm" onClick={() => callBulk(DesignerTransitionAction.Restart)}>
                      <RotateCcw size={14} /> Nhận làm lại
                    </Button>
                  )}
                  {bulkActions.includes(DesignerTransitionAction.Complete) && (
                    <Button size="sm" onClick={() => callBulk(DesignerTransitionAction.Complete)}>
                      <CheckCircle2 size={14} /> Hoàn thành
                    </Button>
                  )}
                  {bulkActions.includes(DesignerTransitionAction.Reject) && (
                    <Button size="sm" variant="destructive" onClick={() => setBulkReject(true)}>
                      <XCircle size={14} /> Trả lại
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

        <RejectModal
          open={!!rejectTarget || bulkReject}
          productionId={
            bulkReject ? `${selected.size} đơn được chọn` : rejectTarget?.productionId
          }
          onClose={() => {
            setRejectTarget(null);
            setBulkReject(false);
          }}
          onConfirm={(reason) => (bulkReject ? handleBulkReject(reason) : handleSingleReject(reason))}
        />
        <TaskDetailDialog orderId={detailId} onClose={() => setDetailId(null)} />
        <ImagePreviewDialog
          open={!!preview}
          onOpenChange={(o) => !o && setPreview(null)}
          url={preview?.url}
          originalUrl={preview?.original}
          title={preview?.title}
        />
      </div>
    </TooltipProvider>
  );
}

// Thứ tự ưu tiên size để các đơn cùng size đứng cạnh nhau trong mỗi nhóm sản phẩm.
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
const SIZE_ALIAS: Record<string, string> = {
  XXL: '2XL',
  XXXL: '3XL',
  XXXXL: '4XL',
  XXXXXL: '5XL',
};
function sizeRank(size?: string): number {
  if (!size) return SIZE_ORDER.length + 1; // không có size → dồn cuối
  const raw = size.trim().toUpperCase();
  const norm = SIZE_ALIAS[raw] || raw;
  const i = SIZE_ORDER.indexOf(norm);
  return i === -1 ? SIZE_ORDER.length : i; // size lạ → trước nhóm "không có size"
}

function groupByType(cards: DesignerTaskCard[]): [string, DesignerTaskCard[]][] {
  const map = new Map<string, DesignerTaskCard[]>();
  for (const r of cards) {
    const k = r.type || '— Chưa có type —';
    const arr = map.get(k) || [];
    arr.push(r);
    map.set(k, arr);
  }
  // Trong mỗi nhóm sản phẩm: sắp xếp theo size ưu tiên XS→5XL (size giống nhau
  // đứng cạnh nhau). Array.sort ổn định nên cùng size vẫn giữ thứ tự ngày từ BE.
  for (const [, arr] of map) {
    arr.sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function KPI({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${accent}`}>{value}</p>
    </div>
  );
}

interface ColProps {
  colKey: ColKey;
  cards: DesignerTaskCard[];
  selected: Set<string>;
  activeDragId?: string;
  onCheckCard: (id: string, checked: boolean, withShift: boolean) => void;
  onCheckGroup: (rows: DesignerTaskCard[], checked: boolean) => void;
  onClickId: (id: string) => void;
  onPreview: (url: string, title: string, original?: string) => void;
  onRejectCard: (card: DesignerTaskCard) => void;
}

function Column({
  colKey,
  cards,
  selected,
  activeDragId,
  onCheckCard,
  onCheckGroup,
  onClickId,
  onPreview,
  onRejectCard,
}: ColProps) {
  const meta = COL_META[colKey];
  const { setNodeRef, isOver } = useDroppable({ id: colKey });
  const groups = useMemo(() => groupByType(cards), [cards]);

  // Mặc định mở tất cả group; user click header để collapse/expand riêng từng cái.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (type: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border-2 ${meta.accent} bg-muted/30 p-2.5 transition-colors min-h-[200px] flex flex-col gap-2 ${isOver ? 'bg-muted/60' : ''
        }`}
    >
      <div className="flex items-center justify-between text-xs font-semibold text-foreground">
        <span>{meta.label}</span>
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
                {isCollapsed ? (
                  <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate" title={type}>
                  {type}
                </span>
                <span className="text-muted-foreground font-normal">
                  {selCount}/{rows.length}
                </span>
              </div>

              {!isCollapsed && (
                <div className="space-y-2 pl-2 pr-2 border-l-2 border-border/40 ml-2.5">
                  {rows.map((c) => {
                    const checked = selected.has(c._id);
                    const isDragging = activeDragId === c._id;
                    return (
                      <div
                        key={c._id}
                        className={`relative group transition-opacity ${isDragging ? 'opacity-30' : ''
                          }`}
                      >
                        {/* Checkbox góc — không can thiệp drag (sensor distance=6) */}
                        <div className="absolute top-1.5 left-1.5 z-10">
                          <input
                            type="checkbox"
                            checked={checked}
                            onClick={(e) => {
                              const me = e.nativeEvent as MouseEvent;
                              (e.currentTarget as HTMLInputElement & { __shift?: boolean }).__shift = me.shiftKey;
                            }}
                            onChange={(e) => {
                              const ws = ((e.currentTarget as HTMLInputElement & { __shift?: boolean }).__shift) || false;
                              onCheckCard(c._id, e.currentTarget.checked, ws);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 accent-indigo-500"
                          />
                        </div>

                        <div
                          className={
                            checked
                              ? 'rounded-md ring-1 ring-indigo-400/70 bg-indigo-50/40 dark:bg-indigo-500/5 transition-colors'
                              : 'transition-colors'
                          }
                        >
                          <TaskCard
                            card={c}
                            onPreview={onPreview}
                            onClickProductionId={() => onClickId(c._id)}
                          />
                        </div>

                        {(colKey === 'assigned' || colKey === 'inProgress') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRejectCard(c);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="absolute top-1 right-1 text-[10px] text-rose-600 hover:text-rose-700 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded px-1.5 py-0.5"
                            title="Trả lại"
                          >
                            Trả
                          </button>
                        )}
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
