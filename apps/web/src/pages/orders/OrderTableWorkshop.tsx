import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Ban, CalendarClock, ChevronDown, ChevronRight, FilterX, History, MousePointerClick, PauseCircle, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { WorkshopAvailableFilters } from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { OrderFilterBar, type OrderFilterFacet } from '@/components/orders/OrderFilterBar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BulkEditToolbar } from '@/components/orders/BulkEditToolbar';
import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog';
import { OrderLogTimelineDialog } from '@/components/orders/OrderLogTimelineDialog';
import { DesignerBacklogDialog } from '@/components/orders/DesignerBacklogDialog';
import { OrderRowActionsMenu } from '@/components/orders/OrderRowActionsMenu';
import { CancelledBadge } from '@/components/orders/CancelledBadge';
import { HeldBadge } from '@/components/orders/HeldBadge';
import { isCancelled, isHeld } from '@/utils/orderActions';
import { DesignerSummaryPanel } from './DesignerSummaryPanel';
import {
  WORKSHOP_COLS,
  type WorkshopColMeta,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { usePermission } from '@/hooks/usePermission';
import { usePendingDesignsPoll } from '@/hooks/usePendingDesignsPoll';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { NO_TOOL_ROW_CLASS, useIsNoTool } from '@/hooks/useIsNoTool';
import { cn } from '@/utils/cn';

// Types and column config live in workshopTableConfig.tsx (shared with OrdersMiniTable).
type OrderRow = WorkshopOrderRow;
type RenderCtx = WorkshopRenderCtx;
const COLS = WORKSHOP_COLS;

// Pagination unit is product types (not rows). 20 products fits comfortably
// in the collapsed view; user can drill in via chevron.
const DEFAULT_PAGE_SIZE = 20;

// Màu chip cho từng filter (full class string — Tailwind cần static để purge).
const FILTER_CHIP_COLORS: Record<string, string> = {
  search: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600',
  date: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  fabricType: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  machineNumber: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
  printStatus: 'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800',
  toolResult: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  toolResultNote: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
  errorFile: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
  assignee: 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
  designerStatus: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800',
  productionError: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  userSku: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 dark:border-fuchsia-800',
};
const FILTER_CHIP_DEFAULT =
  'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600';
const fmtChipDate = (s: string) => (s ? s.split('-').reverse().slice(0, 2).join('/') : '');

function todayISO(): string {
  // Local date components — KHÔNG dùng toISOString() (UTC) vì sẽ trả hôm
  // trước khi ở UTC+ buổi sáng.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Combo = (size + loại vải + mockup). Dùng để đếm ×N + highlight combo trùng.
const comboKeyOf = (r: OrderRow) =>
  `${r.size || ''}|${r.fabricType || ''}|${r.mockupOriginalUrl || r.mockupUrl || ''}`;

// Virtualization cần cột width CỐ ĐỊNH (table-fixed) để không giật khi cuộn.
// Lấy số px từ class `min-w-[Npx]` của mỗi cột làm width; fallback 140.
const CHECKBOX_COL_W = 32; // khớp `w-8` + sticky left-8 của cột productionId
const ACTIONS_COL_W = 64; // khớp `w-16` cột action cuối
const parseColWidth = (c: WorkshopColMeta): number => {
  const m = c.width?.match(/min-w-\[(\d+)px\]/);
  return m ? Number(m[1]) : 140;
};

// Scroll thật của app nằm ở `<main className="overflow-auto">` (MainLayout),
// KHÔNG phải window → virtualizer phải trỏ đúng scroll container này. Tìm
// ancestor gần nhất có overflow-y auto/scroll; fallback documentElement.
const getScrollParent = (node: HTMLElement | null): HTMLElement => {
  let el = node?.parentElement ?? null;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return el;
    el = el.parentElement;
  }
  return document.scrollingElement as HTMLElement || document.documentElement;
};

interface ProductRowProps {
  row: OrderRow;
  cols: WorkshopColMeta[];
  ctx: RenderCtx;
  comboN: number;
  isHeaviest: boolean;
  isSelected: boolean;
  noTool: boolean;
  onCheckboxChange: (id: string) => void;
  onCheckboxMouseDown: (shiftKey: boolean) => void;
  onHistory: (id: string, productionId: string) => void;
  patchRow: (id: string, patch: Partial<OrderRow>) => void;
  /** react-virtual: đo chiều cao thật của row (dynamic size) + map data-index. */
  measureRef?: (el: HTMLElement | null) => void;
  dataIndex?: number;
}

/**
 * 1 hàng đơn (product row) — `React.memo` để tick checkbox / mở preview / poll
 * design KHÔNG re-render toàn bảng. Props đều primitive/stable (isSelected,
 * comboN, noTool…) hoặc callback đã `useCallback` ở parent → shallow-compare
 * chuẩn. `ctx` (renderCtx) memo ở parent nên identity ổn định.
 */
const ProductRow = React.memo(function ProductRow({
  row,
  cols,
  ctx,
  comboN,
  isHeaviest,
  isSelected,
  noTool,
  onCheckboxChange,
  onCheckboxMouseDown,
  onHistory,
  patchRow,
  measureRef,
  dataIndex,
}: ProductRowProps) {
  const cancelled = isCancelled(row);
  const held = isHeld(row);
  const dim = cancelled || held;
  // Memo nội dung cell (c.render) theo [cols, row, ctx] — 3 prop này ổn định
  // khi row không đổi. Nhờ vậy khi ProductRow re-render CHỈ vì đổi isSelected
  // (→ đổi rowBgClass sticky), các cell component (IconSelectCell, Assignee…)
  // KHÔNG render lại vì element ref được cache → React bail subtree.
  // Đơn đang GIỮ → override canEditField=false cho mọi cell (read-only). Menu
  // "..." (Mở giữ) nằm ở cột riêng nên vẫn thao tác được.
  const renderedCells = useMemo(
    () => cols.map((c) => c.render(row, held ? { ...ctx, canEditField: () => false } : ctx)),
    [cols, row, ctx, held],
  );
  // Trải thẳng bg classes (KHÔNG dùng bg-inherit vì sticky cell cần own bg để
  // mask cell scroll phía sau — `inherit` không reliable với TR background).
  const rowBgClass = isSelected
    ? 'bg-primary/10 dark:bg-primary/20'
    : isHeaviest
      ? 'bg-amber-50 dark:bg-amber-500/10'
      : noTool
        ? 'bg-sky-100 dark:bg-sky-500/20'
        : 'bg-card';
  return (
    <TableRow
      ref={measureRef}
      data-index={dataIndex}
      className={cn(
        rowBgClass,
        noTool && 'border-l-2 border-l-sky-400 dark:border-l-sky-400/60',
        held && 'border-l-2 border-l-amber-400 dark:border-l-amber-400/60',
        dim && 'opacity-60',
      )}
    >
      <TableCell className={cn('sticky left-0 z-10', rowBgClass)}>
        <input
          type="checkbox"
          checked={isSelected}
          onMouseDown={(e) => onCheckboxMouseDown(e.shiftKey)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onCheckboxChange(row._id)}
          title="Shift+click để chọn cả range tới checkbox trước đó"
        />
      </TableCell>
      {cols.map((c, i) => (
        <TableCell
          key={c.key}
          className={cn(
            'py-2',
            i === 0 &&
              cn('sticky left-8 z-10 shadow-[1px_0_0_0_var(--border)]', rowBgClass),
          )}
        >
          <div className="flex items-center gap-1.5">
            {c.key === 'mockupTypeSize' && comboN > 1 && (
              <Badge
                variant={isHeaviest ? 'warning' : 'secondary'}
                className="font-mono text-[10px] px-1 py-0 shrink-0"
                title={`Có ${comboN} đơn cùng (size + loại vải + mockup) trong sản phẩm này`}
              >
                ×{comboN}
              </Badge>
            )}
            {i === 0 && cancelled && <CancelledBadge reason={row.cancelReason} />}
            {i === 0 && held && !cancelled && <HeldBadge reason={row.holdReason} />}
            <div className="min-w-0 flex-1">{renderedCells[i]}</div>
          </div>
        </TableCell>
      ))}
      <TableCell className={cn('sticky right-0 z-10', rowBgClass)}>
        <div className="flex items-center justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Lịch sử"
            onClick={() => onHistory(row._id, row.productionId)}
          >
            <History size={13} className="text-muted-foreground" />
          </Button>
          <OrderRowActionsMenu order={row} onChanged={(u) => patchRow(u._id, u)} />
        </div>
      </TableCell>
    </TableRow>
  );
});

export function OrderTableWorkshop() {
  const { has, canViewField, canEditField, roleName } = usePermission();
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);

  // URL params (prefix `w` = workshop). F5 giữ nguyên filter. Single-select
  // mỗi facet sau khi chuyển sang SelectFilter — multi-value support removed.
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('wpage'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const s = Number(searchParams.get('wsize'));
    return Number.isFinite(s) && s > 0 ? s : DEFAULT_PAGE_SIZE;
  });
  // Default = today (workshop dùng "đơn hôm nay" làm view chính). User vẫn
  // có thể chọn range khác hoặc clear hẳn qua DateRangePicker.
  const [createdFrom, setCreatedFrom] = useState(() => searchParams.get('wfrom') || todayISO());
  const [createdTo, setCreatedTo] = useState(() => searchParams.get('wto') || todayISO());
  const [search, setSearch] = useState(() => searchParams.get('wsearch') || '');
  const debouncedSearch = useDebounce(search, 300);
  // Lọc bulk theo danh sách productionId (modal "Nhiều mã"). Transient — không
  // sync URL vì danh sách có thể rất dài. Loại trừ nhau với search thường.
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Anchor cho shift+click range-select. Update mỗi lần user click checkbox. */
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  /**
   * Bắt shiftKey ở mousedown (chạy TRƯỚC native checkbox toggle), đọc lại
   * trong onChange. Không thể đọc shiftKey từ onChange synthetic event vì
   * change event không carry modifier keys.
   */
  const shiftKeyRef = useRef(false);
  const [preview, setPreview] = useState<{ url: string; originalUrl?: string; title: string; sourceUrl?: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; productionId: string } | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ id: string; productionId: string } | null>(null);
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());

  const toggleType = useCallback((t: string) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  // Filters by workshop code — single value mỗi facet.
  const [filterPrintStatus, setFilterPrintStatus] = useState<string>(
    () => searchParams.get('wprint') || '',
  );
  const [filterToolResultNote, setFilterToolResultNote] = useState<string>(
    () => searchParams.get('wnote') || '',
  );
  const [filterAssignee, setFilterAssignee] = useState<string>(
    () => searchParams.get('wassign') || '',
  );
  const [filterProductionError, setFilterProductionError] = useState<string>(
    () => searchParams.get('werror') || '',
  );
  const [filterFabricType, setFilterFabricType] = useState<string>(
    () => searchParams.get('wfabric') || '',
  );
  const [filterMachineNumber, setFilterMachineNumber] = useState<string>(
    () => searchParams.get('wmnum') || '',
  );
  const [filterToolResult, setFilterToolResult] = useState<string>(
    () => searchParams.get('wtool') || '',
  );
  const [filterErrorFile, setFilterErrorFile] = useState<string>(
    () => searchParams.get('werrfile') || '',
  );
  const [filterDesignerStatus, setFilterDesignerStatus] = useState<string>(
    () => searchParams.get('wdstatus') || '',
  );
  const [filterUserSku, setFilterUserSku] = useState<string>(
    () => searchParams.get('wusersku') || '',
  );
  // Toggle "Đang giữ" — chỉ hiện đơn đang bị giữ (heldAt set).
  const [filterHeld, setFilterHeld] = useState<boolean>(
    () => searchParams.get('wheld') === 'true',
  );
  // Toggle "Đã hủy" — chỉ hiện đơn đã hủy (cancelledAt set). Mặc định tắt: đơn
  // hủy vẫn hiện tô xám trong list nhưng KHÔNG tính vào facet count.
  const [filterCancelled, setFilterCancelled] = useState<boolean>(
    () => searchParams.get('wcancel') === 'true',
  );

  // Sync state → URL (replace). Strip default/empty values.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        search ? sp.set('wsearch', search) : sp.delete('wsearch');
        createdFrom ? sp.set('wfrom', createdFrom) : sp.delete('wfrom');
        createdTo ? sp.set('wto', createdTo) : sp.delete('wto');
        filterPrintStatus ? sp.set('wprint', filterPrintStatus) : sp.delete('wprint');
        filterToolResultNote ? sp.set('wnote', filterToolResultNote) : sp.delete('wnote');
        filterAssignee ? sp.set('wassign', filterAssignee) : sp.delete('wassign');
        filterProductionError ? sp.set('werror', filterProductionError) : sp.delete('werror');
        filterFabricType ? sp.set('wfabric', filterFabricType) : sp.delete('wfabric');
        filterMachineNumber ? sp.set('wmnum', filterMachineNumber) : sp.delete('wmnum');
        filterToolResult ? sp.set('wtool', filterToolResult) : sp.delete('wtool');
        filterErrorFile ? sp.set('werrfile', filterErrorFile) : sp.delete('werrfile');
        filterDesignerStatus ? sp.set('wdstatus', filterDesignerStatus) : sp.delete('wdstatus');
        filterUserSku ? sp.set('wusersku', filterUserSku) : sp.delete('wusersku');
        filterHeld ? sp.set('wheld', 'true') : sp.delete('wheld');
        filterCancelled ? sp.set('wcancel', 'true') : sp.delete('wcancel');
        page > 1 ? sp.set('wpage', String(page)) : sp.delete('wpage');
        pageSize !== DEFAULT_PAGE_SIZE ? sp.set('wsize', String(pageSize)) : sp.delete('wsize');
        return sp;
      },
      { replace: true },
    );
  }, [
    search,
    createdFrom,
    createdTo,
    filterPrintStatus,
    filterToolResultNote,
    filterAssignee,
    filterProductionError,
    filterFabricType,
    filterMachineNumber,
    filterToolResult,
    filterErrorFile,
    filterDesignerStatus,
    filterUserSku,
    filterHeld,
    filterCancelled,
    page,
    pageSize,
    setSearchParams,
  ]);

  const [workshopFilters, setWorkshopFilters] = useState<WorkshopAvailableFilters | null>(null);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  const visibleCols = useMemo(() => {
    const filtered = COLS.filter((c) => !c.perm || canViewField(c.key));
    // Support role muốn 4 cột tool-result/note/error-file/error-note đứng
    // TRƯỚC `printStatus` (workflow: soát tool → in). Reorder client-side để
    // không ảnh hưởng layout role khác. Idempotent: chỉ swap nếu thấy đủ.
    if (roleName !== 'Support') return filtered;
    const SUPPORT_BEFORE_PRINT = ['toolResult', 'toolResultNote', 'errorFile', 'errorFileNote'];
    const printIdx = filtered.findIndex((c) => c.key === 'printStatus');
    if (printIdx < 0) return filtered;
    const supportCols = SUPPORT_BEFORE_PRINT.map((k) => filtered.find((c) => c.key === k)).filter(
      (c): c is NonNullable<typeof c> => !!c,
    );
    if (supportCols.length === 0) return filtered;
    const without = filtered.filter((c) => !SUPPORT_BEFORE_PRINT.includes(c.key));
    const newPrintIdx = without.findIndex((c) => c.key === 'printStatus');
    return [...without.slice(0, newPrintIdx), ...supportCols, ...without.slice(newPrintIdx)];
  }, [canViewField, roleName]);

  // Server returns groups of products (page = N products, not N rows). We keep
  // the flat `items` list for things like bulk select + checkbox state, but
  // also retain the group structure to render section headers without
  // recomputing per-product totals on the client.
  const [groups, setGroups] = useState<
    Array<{ type: string; totalOrders: number; totalQuantity: number; orders: OrderRow[] }>
  >([]);

  const buildFilterParams = (): URLSearchParams => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (bulkIds.length) params.set('productionIds', bulkIds.join(','));
    if (filterPrintStatus) params.set('printStatus', filterPrintStatus);
    if (filterToolResultNote) params.set('toolResultNote', filterToolResultNote);
    if (filterAssignee) params.set('assignee', filterAssignee);
    if (filterProductionError) params.set('productionError', filterProductionError);
    if (filterFabricType) params.set('fabricType', filterFabricType);
    if (filterMachineNumber) params.set('machineNumber', filterMachineNumber);
    if (filterToolResult) params.set('toolResult', filterToolResult);
    if (filterErrorFile) params.set('errorFile', filterErrorFile);
    if (filterDesignerStatus) params.set('designerStatus', filterDesignerStatus);
    if (filterUserSku) params.set('userSku', filterUserSku);
    if (filterHeld) params.set('held', 'true');
    if (filterCancelled) params.set('cancelled', 'true');
    if (createdFrom) params.set('createdFrom', createdFrom);
    if (createdTo) params.set('createdTo', createdTo);
    return params;
  };

  const fetchData = async () => {
    const params = buildFilterParams();
    params.set('page', String(page));
    params.set('limit', String(pageSize));

    try {
      const res = await RepositoryRemote.order.getOrdersGrouped('?' + params.toString());
      const grouped = (res.data?.data || []) as Array<{
        type: string;
        totalOrders: number;
        totalQuantity: number;
        orders: OrderRow[];
      }>;
      setGroups(grouped);
      setItems(grouped.flatMap((g) => g.orders));
      // total = number of product types (server pagination unit).
      setTotal(res.data?.total || 0);
      // Default: every product section is collapsed. User clicks chevron or
      // "Mở hết" to expand.
      setCollapsedTypes(new Set(grouped.map((g) => g.type || '(không có tên)')));
    } catch (err) {
      handleAxiosError(err);
    }
  };

  const fetchFilters = async () => {
    const params = buildFilterParams();
    try {
      const res = await RepositoryRemote.order.getWorkshopFilters('?' + params.toString());
      setWorkshopFilters((res.data?.data || null) as WorkshopAvailableFilters | null);
    } catch (err) {
      handleAxiosError(err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchData(), fetchFilters()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    pageSize,
    debouncedSearch,
    bulkIds,
    filterPrintStatus,
    filterToolResultNote,
    filterAssignee,
    filterProductionError,
    filterFabricType,
    filterMachineNumber,
    filterToolResult,
    filterErrorFile,
    filterDesignerStatus,
    filterUserSku,
    filterHeld,
    filterCancelled,
    createdFrom,
    createdTo,
  ]);

  /**
   * Optimistic update sau khi cell PATCH thành công. Phải đồng bộ CẢ 2 state:
   *   - `items` (flat list, dùng cho select-all + visibleOrderedIds + poll)
   *   - `groups` (grouped-by-type, RENDER chính của table — body map từ
   *     `groups[].orders`). Nếu chỉ update `items` thì UI không đổi cho đến
   *     khi user F5 (fetchData ghi đè `groups`).
   */
  const patchRow = useCallback((id: string, patch: Partial<OrderRow>) => {
    setItems((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        orders: g.orders.map((r) => (r._id === id ? { ...r, ...patch } : r)),
      })),
    );
  }, []);

  usePendingDesignsPoll(items, patchRow);

  const openPreview = useCallback(
    (url: string, title: string, originalUrl?: string, sourceUrl?: string) =>
      setPreview({ url, originalUrl, title, sourceUrl }),
    [],
  );

  const onCheckboxMouseDown = useCallback((shiftKey: boolean) => {
    shiftKeyRef.current = shiftKey;
  }, []);

  const onHistory = useCallback(
    (id: string, productionId: string) => setHistoryTarget({ id, productionId }),
    [],
  );

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map((it) => it._id));
    });
  };

  type DecoratedGroup = {
    type: string;
    totalOrders: number;
    totalQuantity: number;
    maxCombo: number;
    sortedOrders: OrderRow[];
    rowMeta: Map<string, { comboN: number; isHeaviest: boolean }>;
  };

  /**
   * Decorate 1 lần khi `groups` đổi: đếm combo (size+vải+mockup) + sort theo
   * combo desc + meta ×N/heaviest theo rowId. KHÔNG phụ thuộc selection/collapse
   * → tick checkbox / mở-đóng group KHÔNG tính lại sort. Trước đây comboCount +
   * sort chạy lại MỖI render ngay trong body (một lần cho render, một lần nữa
   * trong visibleOrderedIds) → đây là hot-path chính khi bảng nhiều đơn.
   */
  const decoratedGroups = useMemo<DecoratedGroup[]>(() => {
    return groups.map((g) => {
      const comboCount = new Map<string, number>();
      for (const r of g.orders) {
        const k = comboKeyOf(r);
        comboCount.set(k, (comboCount.get(k) || 0) + 1);
      }
      const maxCombo = Math.max(0, ...Array.from(comboCount.values()));
      const sortedOrders = [...g.orders].sort((a, b) => {
        const pa = a.priority || 0;
        const pb = b.priority || 0;
        if (pb !== pa) return pb - pa;
        const ca = comboCount.get(comboKeyOf(a)) || 1;
        const cb = comboCount.get(comboKeyOf(b)) || 1;
        if (cb !== ca) return cb - ca;
        return comboKeyOf(a).localeCompare(comboKeyOf(b));
      });
      const rowMeta = new Map<string, { comboN: number; isHeaviest: boolean }>();
      for (const r of g.orders) {
        const n = comboCount.get(comboKeyOf(r)) || 1;
        rowMeta.set(r._id, { comboN: n, isHeaviest: n > 1 && n === maxCombo });
      }
      return {
        type: g.type || '(không có tên)',
        totalOrders: g.totalOrders,
        totalQuantity: g.totalQuantity,
        maxCombo,
        sortedOrders,
        rowMeta,
      };
    });
  }, [groups]);

  /**
   * Flat ordered list of currently visible order IDs (skip groups bị collapse).
   * Khớp THỨ TỰ render dưới body — anchor index cho shift+click range select.
   */
  const visibleOrderedIds = useMemo(() => {
    const out: string[] = [];
    for (const g of decoratedGroups) {
      if (collapsedTypes.has(g.type)) continue;
      for (const r of g.sortedOrders) out.push(r._id);
    }
    return out;
  }, [decoratedGroups, collapsedTypes]);

  // Refs mirror state để `handleCheckboxChange` giữ identity ổn định (useCallback
  // deps rỗng) mà vẫn đọc được giá trị mới nhất tại thời điểm click.
  const selectedRef = useRef(selected);
  const lastClickedIdRef = useRef(lastClickedId);
  const visibleOrderedIdsRef = useRef<string[]>(visibleOrderedIds);
  selectedRef.current = selected;
  lastClickedIdRef.current = lastClickedId;
  visibleOrderedIdsRef.current = visibleOrderedIds;

  // Đếm số đơn đã chọn theo product type — cho badge "x/y chọn" + trạng thái
  // checkbox group header. Memo để không quét toàn bộ orders mỗi render.
  const selectedCountByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of decoratedGroups) {
      let c = 0;
      for (const r of g.sortedOrders) if (selected.has(r._id)) c++;
      m.set(g.type, c);
    }
    return m;
  }, [selected, decoratedGroups]);

  // ---- Virtualization (window scroll) --------------------------------------
  // Flatten groups + rows (theo collapse) thành 1 danh sách phẳng để virtualize:
  // mỗi item là 'header' (dòng tiêu đề sản phẩm) hoặc 'row' (1 đơn). Cuộn tới
  // đâu render tới đó → không mount hàng trăm DOM row 1 lúc khi mở nhóm lớn.
  type FlatItem =
    | { kind: 'header'; key: string; group: DecoratedGroup }
    | {
        kind: 'row';
        key: string;
        row: OrderRow;
        groupType: string;
        comboN: number;
        isHeaviest: boolean;
      };
  const flatItems = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    for (const g of decoratedGroups) {
      out.push({ kind: 'header', key: `h:${g.type}`, group: g });
      if (collapsedTypes.has(g.type)) continue;
      for (const row of g.sortedOrders) {
        const meta = g.rowMeta.get(row._id);
        out.push({
          kind: 'row',
          key: row._id,
          row,
          groupType: g.type,
          comboN: meta?.comboN ?? 1,
          isHeaviest: meta?.isHeaviest ?? false,
        });
      }
    }
    return out;
  }, [decoratedGroups, collapsedTypes]);

  // Cột width cố định (table-fixed) + tổng width bảng cho horizontal scroll.
  const colWidths = useMemo(() => visibleCols.map(parseColWidth), [visibleCols]);
  const totalTableWidth = useMemo(
    () => CHECKBOX_COL_W + colWidths.reduce((s, w) => s + w, 0) + ACTIONS_COL_W,
    [colWidths],
  );

  // scrollMargin = offset (tính từ đỉnh document) của <tbody> — nơi row index 0
  // bắt đầu. Re-measure khi layout phía trên đổi (panel/filter chips) qua
  // ResizeObserver trên body + window resize (sum getBoundingClientRect().top +
  // scrollY ổn định khi cuộn → chỉ cần đo lại lúc layout đổi).
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Xác định scroll container thật (main.overflow-auto) sau khi mount.
  useLayoutEffect(() => {
    const sc = getScrollParent(rootRef.current);
    scrollElRef.current = sc;
    setScrollEl(sc);
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const body = tbodyRef.current;
      const sc = scrollElRef.current;
      if (!body || !sc) return;
      // Offset của <tbody> trong nội dung cuộn của scroll container (không đổi
      // khi cuộn vì trừ đi bù cộng scrollTop) — chỉ đo lại khi layout đổi.
      const margin =
        body.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
      setScrollMargin(Math.max(0, margin));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (document.body) ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [scrollEl]);

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollEl,
    // Ước lượng SÁT chiều cao thật (row Production/Order thường 2-3 dòng ~68px)
    // để tổng chiều cao không bị thiếu → không "cụt" hàng cuối khi cuộn tới đáy.
    // measureElement vẫn tự đo lại chính xác sau khi render.
    estimateSize: (i) => (flatItems[i]?.kind === 'header' ? 42 : 68),
    overscan: 12,
    scrollMargin,
    getItemKey: (i) => flatItems[i]?.key ?? i,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const virtualPadTop = virtualItems.length
    ? virtualItems[0].start - rowVirtualizer.options.scrollMargin
    : 0;
  const virtualPadBottom = virtualItems.length
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;
  const fullColSpan = visibleCols.length + 2;

  /**
   * Excel-style range select. Native checkbox toggle chạy bình thường (visual
   * sync chính xác), state sync ở onChange. shiftKey lấy từ ref đã set ở
   * mousedown vì change event không carry modifier keys.
   *
   * Trước đó dùng preventDefault trên onClick → React skip update DOM `checked`
   * cho row vừa click → state đúng nhưng UI miss tick row cuối.
   */
  const handleCheckboxChange = useCallback((id: string) => {
    const isShift = shiftKeyRef.current;
    shiftKeyRef.current = false;
    const lastClicked = lastClickedIdRef.current;
    const ordered = visibleOrderedIdsRef.current;
    if (isShift && lastClicked && lastClicked !== id) {
      const lastIdx = ordered.indexOf(lastClicked);
      const curIdx = ordered.indexOf(id);
      if (lastIdx >= 0 && curIdx >= 0) {
        const [from, to] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        const range = ordered.slice(from, to + 1);
        // Native đã toggle row hiện tại — newState = trạng thái sau toggle.
        const newState = !selectedRef.current.has(id);
        setSelected((prev) => {
          const next = new Set(prev);
          for (const rid of range) {
            if (newState) next.add(rid);
            else next.delete(rid);
          }
          return next;
        });
        setLastClickedId(id);
        return;
      }
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastClickedId(id);
  }, []);

  type GroupSelectionState = 'all' | 'some' | 'none';

  const toggleGroupSelection = useCallback((orders: OrderRow[]) => {
    setSelected((prev) => {
      const allSelected = orders.length > 0 && orders.every((o) => prev.has(o._id));
      const next = new Set(prev);
      if (allSelected) {
        for (const o of orders) next.delete(o._id);
      } else {
        for (const o of orders) next.add(o._id);
      }
      return next;
    });
  }, []);

  const openDetail = useCallback(
    (id: string, productionId: string) => setDetailTarget({ id, productionId }),
    [],
  );
  const renderCtx: RenderCtx = useMemo(
    () => ({ canEditField, patchRow, openPreview, openDetail }),
    [canEditField, patchRow, openPreview, openDetail],
  );
  const isNoTool = useIsNoTool();

  // Designer summary chỉ hiện cho role có quyền xem stats designer.
  const canSeeDesignerSummary = has('page.designer_stats') || has('designer.task.assign');

  // Inject "Chưa gán" option vào assignee SelectFilter (token __none__).
  const assigneeOptions = useMemo(() => {
    const base = workshopFilters?.assignee || [];
    // Đã có __none__ từ BE thì giữ nguyên; chưa có thì prepend option fake với
    // count tính từ /designer-breakdown — đơn giản hoá: chỉ thêm static option.
    if (base.find((o) => o.value === '__none__')) return base;
    return [{ value: '__none__', label: 'Chưa gán', count: 0 }, ...base];
  }, [workshopFilters?.assignee]);

  const designerStatusOptions = workshopFilters?.designerStatus || [];

  // Reset chọn đơn về 0 mỗi khi BẤT KỲ filter nào đổi (search/date/facet).
  // KHÔNG phụ thuộc page/pageSize → đổi trang vẫn giữ selection.
  useEffect(() => {
    setSelected(new Set());
    setLastClickedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch,
    bulkIds,
    createdFrom,
    createdTo,
    filterPrintStatus,
    filterToolResultNote,
    filterAssignee,
    filterProductionError,
    filterFabricType,
    filterMachineNumber,
    filterToolResult,
    filterErrorFile,
    filterDesignerStatus,
    filterUserSku,
    filterHeld,
    filterCancelled,
  ]);

  // Định nghĩa facet 1 lần — dùng cho cả OrderFilterBar lẫn chip "đang lọc".
  const facets: OrderFilterFacet[] = [
    { key: 'fabricType', label: 'Loại vải', value: filterFabricType, onChange: setFilterFabricType, options: workshopFilters?.fabricType || [], perm: 'order.field.fabricType.view' },
    { key: 'machineNumber', label: 'Máy', value: filterMachineNumber, onChange: setFilterMachineNumber, options: workshopFilters?.machineNumber || [], perm: 'order.field.machineNumber.view' },
    { key: 'printStatus', label: 'Trạng thái in', value: filterPrintStatus, onChange: setFilterPrintStatus, options: workshopFilters?.printStatus || [], perm: 'order.field.printStatus.view' },
    { key: 'toolResult', label: 'Kết quả Tool', value: filterToolResult, onChange: setFilterToolResult, options: workshopFilters?.toolResult || [], perm: 'order.field.toolResult.view' },
    { key: 'toolResultNote', label: 'Note kq Tool', value: filterToolResultNote, onChange: setFilterToolResultNote, options: workshopFilters?.toolResultNote || [], perm: 'order.field.toolResultNote.view' },
    { key: 'errorFile', label: 'File sửa lỗi', value: filterErrorFile, onChange: setFilterErrorFile, options: workshopFilters?.errorFile || [], perm: 'order.field.errorFile.view' },
    { key: 'userSku', label: 'Khách hàng', value: filterUserSku, onChange: setFilterUserSku, options: workshopFilters?.userSku || [] },
    { key: 'assignee', label: 'Người thực hiện', value: filterAssignee, onChange: setFilterAssignee, options: assigneeOptions, perm: 'order.field.assignee.view' },
    { key: 'designerStatus', label: 'TT Designer', value: filterDesignerStatus, onChange: setFilterDesignerStatus, options: designerStatusOptions, hidden: !canSeeDesignerSummary },
    { key: 'productionError', label: 'Lỗi xưởng', value: filterProductionError, onChange: setFilterProductionError, options: workshopFilters?.productionError || [], perm: 'order.field.productionError.view' },
  ];

  const isDefaultDate = createdFrom === todayISO() && createdTo === todayISO();

  // Chip "đang lọc" — chỉ facet user thấy được (perm/hidden) + search + date custom.
  const activeFilters: Array<{
    key: string;
    label: string;
    display: string;
    color: string;
    onClear: () => void;
  }> = [];
  for (const f of facets) {
    if (f.hidden || (f.perm && !has(f.perm)) || !f.value) continue;
    const opt = f.options.find((o) => o.value === f.value);
    activeFilters.push({
      key: f.key,
      label: f.label,
      display: opt?.label || f.value,
      color: FILTER_CHIP_COLORS[f.key] || FILTER_CHIP_DEFAULT,
      onClear: () => { f.onChange(''); setPage(1); },
    });
  }
  if (search.trim()) {
    activeFilters.push({
      key: 'search',
      label: 'Tìm',
      display: search.trim(),
      color: FILTER_CHIP_COLORS.search,
      onClear: () => { setSearch(''); setPage(1); },
    });
  }
  if (bulkIds.length) {
    activeFilters.push({
      key: 'bulkIds',
      label: 'Nhiều mã',
      display: `${bulkIds.length} mã`,
      color: FILTER_CHIP_COLORS.search,
      onClear: () => { setBulkIds([]); setPage(1); },
    });
  }
  if (!isDefaultDate) {
    activeFilters.push({
      key: 'date',
      label: 'Ngày',
      display: `${fmtChipDate(createdFrom) || '…'} → ${fmtChipDate(createdTo) || '…'}`,
      color: FILTER_CHIP_COLORS.date,
      onClear: () => { setCreatedFrom(todayISO()); setCreatedTo(todayISO()); setPage(1); },
    });
  }
  if (filterHeld) {
    activeFilters.push({
      key: 'held',
      label: 'Trạng thái',
      display: 'Đang giữ',
      color: FILTER_CHIP_COLORS.date,
      onClear: () => { setFilterHeld(false); setPage(1); },
    });
  }
  if (filterCancelled) {
    activeFilters.push({
      key: 'cancelled',
      label: 'Trạng thái',
      display: 'Đã hủy',
      color: FILTER_CHIP_COLORS.date,
      onClear: () => { setFilterCancelled(false); setPage(1); },
    });
  }

  const clearAllFilters = () => {
    setSearch('');
    setBulkIds([]);
    setFilterHeld(false);
    setCreatedFrom(todayISO());
    setCreatedTo(todayISO());
    setFilterFabricType('');
    setFilterMachineNumber('');
    setFilterPrintStatus('');
    setFilterToolResult('');
    setFilterToolResultNote('');
    setFilterErrorFile('');
    setFilterAssignee('');
    setFilterDesignerStatus('');
    setFilterProductionError('');
    setFilterUserSku('');
    setPage(1);
  };

  /**
   * Click cell trong summary panel → set filter list. userId='__none__' tương
   * ứng "Chưa gán" (token BE); status null = chỉ filter assignee.
   */
  const handleSummaryCellClick = (
    userId: string | null,
    status:
      | 'assigned'
      | 'in-progress'
      | 'done'
      | 'rejected'
      | 'rework'
      | 'unassigned'
      | '__unassigned_notool__'
      | '__unassigned_tool__'
      | null,
  ) => {
    if (userId !== null) setFilterAssignee(userId);
    if (status !== null) setFilterDesignerStatus(status);
    setPage(1);
  };

  // Modal "Chi tiết tồn đọng" — click 1 ngày → lọc bảng (assignee + ngày) +
  // đóng modal để xem danh sách task ngay trên bảng chính.
  const [backlogOpen, setBacklogOpen] = useState(false);
  const handleBacklogDrill = (userId: string, day: string, status?: string) => {
    setFilterAssignee(userId === '__unassigned__' ? '__none__' : userId);
    setFilterDesignerStatus(status || ''); // status rỗng = mọi trạng thái ngày đó
    if (day === '__nodate__') {
      setCreatedFrom('');
      setCreatedTo('');
    } else {
      setCreatedFrom(day);
      setCreatedTo(day);
    }
    setPage(1);
    setBacklogOpen(false);
  };

  // Build qs để pass vào panel — cùng shape với buildFilterParams nhưng
  // KHÔNG include `page/limit` (panel scoped theo filter, không pagination).
  const summaryFilterQs = useMemo(() => {
    return buildFilterParams().toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch,
    bulkIds,
    filterPrintStatus,
    filterToolResultNote,
    filterAssignee,
    filterProductionError,
    filterFabricType,
    filterMachineNumber,
    filterToolResult,
    filterErrorFile,
    filterDesignerStatus,
    filterHeld,
    filterCancelled,
    createdFrom,
    createdTo,
  ]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4 pb-24" ref={rootRef}>
        {canSeeDesignerSummary && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setBacklogOpen(true)}
              >
                <CalendarClock size={14} className="mr-1" />
                Chi tiết tồn đọng
              </Button>
            </div>
            <DesignerSummaryPanel
              filterQs={summaryFilterQs}
              onClickCell={handleSummaryCellClick}
            />
          </div>
        )}

        {/* Filter bar — chuẩn cho mọi bảng order. Cùng layout với ErrorLogTab,
            OrderFactoryTab, OrderStatusTab (extract qua <OrderFilterBar>). */}
        <OrderFilterBar
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            if (v && bulkIds.length) setBulkIds([]); // search thường loại bỏ lọc bulk
          }}
          onBulkApply={(ids) => {
            setSearch(''); // bulk và search thường loại trừ nhau
            setBulkIds(ids);
            setPage(1);
          }}
          bulkIds={bulkIds}
          createdFrom={createdFrom}
          createdTo={createdTo}
          onDateRangeChange={(f, t) => {
            setCreatedFrom(f);
            setCreatedTo(t);
            setPage(1);
          }}
          onReload={() => {
            setLoading(true);
            Promise.all([fetchData(), fetchFilters()]).finally(() => setLoading(false));
          }}
          loading={loading}
          topActionsRight={
            <>
              <Button
                variant={filterHeld ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-8"
                onClick={() => {
                  setFilterHeld((v) => !v);
                  setPage(1);
                }}
                title="Chỉ hiện đơn đang bị giữ"
              >
                <PauseCircle size={14} className="mr-1" />
                Đang giữ
                {typeof workshopFilters?.heldCount === 'number' && workshopFilters.heldCount > 0 && (
                  <span className="ml-1 rounded-full bg-amber-200 dark:bg-amber-500/30 px-1.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                    {workshopFilters.heldCount}
                  </span>
                )}
              </Button>
              <Button
                variant={filterCancelled ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-8"
                onClick={() => {
                  setFilterCancelled((v) => !v);
                  setPage(1);
                }}
                title="Chỉ hiện đơn đã hủy (đơn hủy không tính vào bộ lọc)"
              >
                <Ban size={14} className="mr-1" />
                Đã hủy
                {typeof workshopFilters?.cancelledCount === 'number' && workshopFilters.cancelledCount > 0 && (
                  <span className="ml-1 rounded-full bg-rose-200 dark:bg-rose-500/30 px-1.5 text-[10px] font-semibold text-rose-800 dark:text-rose-200">
                    {workshopFilters.cancelledCount}
                  </span>
                )}
              </Button>
              {groups.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => {
                    const allTypes = new Set(groups.map((g) => g.type || '(không có tên)'));
                    setCollapsedTypes((prev) => (prev.size === allTypes.size ? new Set() : allTypes));
                  }}
                >
                  {collapsedTypes.size === groups.length ? 'Mở hết' : 'Thu gọn hết'}
                </Button>
              )}
            </>
          }
          facets={facets}
        />

        {/* Chip "đang lọc" — màu theo từng filter + xoá lẻ + xoá tất cả. */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Đang lọc:</span>
            {activeFilters.map((f) => (
              <span
                key={f.key}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  f.color,
                )}
              >
                <span className="opacity-70">{f.label}:</span>
                <span className="max-w-[160px] truncate">{f.display}</span>
                <button
                  type="button"
                  onClick={f.onClear}
                  className="ml-0.5 rounded-full hover:opacity-60"
                  title={`Bỏ lọc ${f.label}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearAllFilters}
            >
              <FilterX size={13} className="mr-1" />
              Xóa tất cả lọc
            </Button>
          </div>
        )}

        <PaginationBar
          position="top"
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loading}
          onChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
        />

        {/* Selection hint — chỉ hiện khi user chưa chọn gì để tránh nhiễu sau
            khi đã quen với feature. */}
        {selected.size === 0 && items.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <MousePointerClick size={13} className="mt-0.5 shrink-0 text-primary" />
            <div className="space-y-0.5">
              <p>
                <span className="font-medium text-foreground">Mẹo chọn nhiều đơn:</span>{' '}
                Tick checkbox cạnh tên sản phẩm để chọn toàn bộ đơn của sản phẩm đó.
              </p>
              <p>
                Tick 1 đơn, giữ{' '}
                <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">Shift</kbd>{' '}
                rồi click checkbox khác để chọn nhanh tất cả đơn ở giữa (giống Excel / Google Sheets).
              </p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="table-fixed" style={{ width: totalTableWidth }}>
              <colgroup>
                <col style={{ width: CHECKBOX_COL_W }} />
                {visibleCols.map((c, i) => (
                  <col key={c.key} style={{ width: colWidths[i] }} />
                ))}
                <col style={{ width: ACTIONS_COL_W }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 sticky left-0 z-30 bg-card">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selected.size === items.length}
                      onChange={toggleAll}
                      title="Tick để chọn toàn bộ đơn trên trang này"
                    />
                  </TableHead>
                  {visibleCols.map((c, i) => (
                    <TableHead
                      key={c.key}
                      className={cn(
                        'whitespace-nowrap text-xs',
                        // productionId là cột đầu tiên (i===0) — sticky cạnh
                        // checkbox để khi scroll ngang vẫn nhìn thấy ID.
                        // shadow-r mô phỏng viền cho user biết chỗ sticky kết thúc.
                        i === 0 && 'sticky left-8 z-30 bg-card shadow-[1px_0_0_0_var(--border)]',
                      )}
                    >
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-16 sticky right-0 z-30 bg-card"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody ref={tbodyRef}>
                {loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={fullColSpan} className="text-center py-10">
                      <Spinner size={20} className="text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={fullColSpan} className="text-center py-10 text-sm text-muted-foreground">
                      Không có đơn hàng nào phù hợp
                    </TableCell>
                  </TableRow>
                )}
                {/* Spacer trên — chiều cao phần row phía trên vùng đang thấy. */}
                {virtualPadTop > 0 && (
                  <TableRow className="border-0 hover:bg-transparent" style={{ height: virtualPadTop }}>
                    <TableCell colSpan={fullColSpan} className="p-0 border-0" />
                  </TableRow>
                )}
                {virtualItems.map((vi) => {
                  const item = flatItems[vi.index];
                  if (!item) return null;
                  if (item.kind === 'header') {
                    const g = item.group;
                    const selCount = selectedCountByType.get(g.type) || 0;
                    const groupState: GroupSelectionState =
                      selCount === 0
                        ? 'none'
                        : selCount === g.sortedOrders.length
                          ? 'all'
                          : 'some';
                    return (
                      <TableRow
                        key={vi.key}
                        data-index={vi.index}
                        ref={rowVirtualizer.measureElement}
                        className="bg-muted/40 hover:bg-muted/50"
                      >
                        <TableCell
                          className="py-1.5 sticky left-0 z-10 bg-muted/40"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={groupState === 'all'}
                            ref={(el) => {
                              if (el) el.indeterminate = groupState === 'some';
                            }}
                            onChange={() => toggleGroupSelection(g.sortedOrders)}
                            title={`Tick toàn bộ ${g.sortedOrders.length} đơn của sản phẩm này`}
                          />
                        </TableCell>
                        <TableCell
                          colSpan={visibleCols.length + 1}
                          className="py-1.5 cursor-pointer sticky left-8 z-10 bg-muted/40 shadow-[1px_0_0_0_var(--border)]"
                          onClick={() => toggleType(g.type)}
                        >
                          <div className="flex items-center gap-2 text-xs">
                            {collapsedTypes.has(g.type) ? (
                              <ChevronRight size={14} className="text-muted-foreground" />
                            ) : (
                              <ChevronDown size={14} className="text-muted-foreground" />
                            )}
                            <span className="font-semibold text-foreground line-clamp-1">{g.type}</span>
                            <Badge variant="secondary" className="font-mono">
                              {g.totalOrders} đơn
                            </Badge>
                            {groupState !== 'none' && (
                              <Badge variant="success" className="font-mono text-[10px]">
                                {selCount}/{g.sortedOrders.length} chọn
                              </Badge>
                            )}
                            {g.maxCombo > 1 && (
                              <Badge
                                variant="warning"
                                className="font-mono text-[10px]"
                                title="Combo (size + vải + mockup) trùng nhiều nhất trong nhóm"
                              >
                                max ×{g.maxCombo}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <ProductRow
                      key={vi.key}
                      measureRef={rowVirtualizer.measureElement}
                      dataIndex={vi.index}
                      row={item.row}
                      cols={visibleCols}
                      ctx={renderCtx}
                      comboN={item.comboN}
                      isHeaviest={item.isHeaviest}
                      isSelected={selected.has(item.row._id)}
                      noTool={isNoTool(item.row.toolResult)}
                      onCheckboxChange={handleCheckboxChange}
                      onCheckboxMouseDown={onCheckboxMouseDown}
                      onHistory={onHistory}
                      patchRow={patchRow}
                    />
                  );
                })}
                {/* Spacer dưới — chiều cao phần row phía dưới vùng đang thấy. */}
                {virtualPadBottom > 0 && (
                  <TableRow className="border-0 hover:bg-transparent" style={{ height: virtualPadBottom }}>
                    <TableCell colSpan={fullColSpan} className="p-0 border-0" />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            position="bottom"
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            onChange={(p, ps) => {
              setPage(p);
              setPageSize(ps);
            }}
          />
        </div>

        <BulkEditToolbar
          selectedIds={Array.from(selected)}
          onClear={() => setSelected(new Set())}
          onApplied={() => {
            setSelected(new Set());
            fetchData();
          }}
        />

        <ImagePreviewDialog
          open={!!preview}
          onOpenChange={(o) => !o && setPreview(null)}
          url={preview?.url}
          originalUrl={preview?.originalUrl}
          title={preview?.title}
          ensurePreviewSource={preview?.sourceUrl}
        />

        <OrderLogTimelineDialog
          open={!!historyTarget}
          onOpenChange={(o) => !o && setHistoryTarget(null)}
          orderId={historyTarget?.id}
          productionId={historyTarget?.productionId}
        />

        <OrderDetailDialog
          open={!!detailTarget}
          onOpenChange={(o) => !o && setDetailTarget(null)}
          orderId={detailTarget?.id ?? null}
          productionId={detailTarget?.productionId}
        />

        <DesignerBacklogDialog
          open={backlogOpen}
          onClose={() => setBacklogOpen(false)}
          onDrillDay={handleBacklogDrill}
        />
      </div>
    </TooltipProvider>
  );
}

