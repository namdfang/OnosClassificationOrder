import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, History, Keyboard, MousePointerClick } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkshopAvailableFilters } from 'shared';

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
import {
  PRINT_COLS,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { usePermission } from '@/hooks/usePermission';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsNoTool } from '@/hooks/useIsNoTool';
import { cn } from '@/utils/cn';

type OrderRow = WorkshopOrderRow;
const COLS = PRINT_COLS;
const DEFAULT_PAGE_SIZE = 50;

type StatusCounts = {
  all: number;
  waiting: number;
  inProgress: number;
  rework: number;
  done: number;
  fixed: number;
  watching: number;
};
const EMPTY_COUNTS: StatusCounts = {
  all: 0,
  waiting: 0,
  inProgress: 0,
  rework: 0,
  done: 0,
  fixed: 0,
  watching: 0,
};

/** value '' = tất cả (không lọc theo stage status). */
const STATUS_TABS: Array<{ value: string; label: string; countKey: keyof StatusCounts; accent: string }> = [
  { value: '', label: 'Tất cả', countKey: 'all', accent: 'text-foreground' },
  { value: 'waiting', label: 'Đang chờ', countKey: 'waiting', accent: 'text-zinc-600 dark:text-zinc-300' },
  { value: 'in-progress', label: 'Đang làm', countKey: 'inProgress', accent: 'text-indigo-600' },
  { value: 'rework', label: 'Làm lại', countKey: 'rework', accent: 'text-amber-600' },
  { value: 'done', label: 'Đã xong', countKey: 'done', accent: 'text-emerald-600' },
  { value: 'fixed', label: 'Đã sửa', countKey: 'fixed', accent: 'text-teal-600' },
  { value: 'watching', label: 'Đang chờ quay lại', countKey: 'watching', accent: 'text-sky-600' },
];

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface PrintOrderTableProps {
  /** Render action mỗi dòng (cột sticky phải). Trả null = dòng không có action. */
  extraRowAction?: (row: OrderRow) => React.ReactNode;
  extraActionLabel?: string;
  /** Bump để ép refetch (sau transition). */
  reloadToken?: number;
  /**
   * Đơn có được tick chọn không (vd chỉ đơn ở stage In + cùng xưởng + trạng
   * thái hợp lệ). Mặc định: tất cả chọn được.
   */
  isRowSelectable?: (row: OrderRow) => boolean;
  /**
   * Render bulk toolbar tuỳ biến (vd chuyển trạng thái). Nhận danh sách row đã
   * chọn + hàm clear. Nếu không truyền → fallback `BulkEditToolbar` mặc định.
   */
  renderBulkBar?: (selectedRows: OrderRow[], clear: () => void) => React.ReactNode;
  /**
   * Khi set (YYYY-MM-DD) → ép `createdFrom=createdTo=dayOverride` cho query
   * (bảng "Tổng quan theo ngày" click 1 ngày). Vì bảng In phân trang server nên
   * không lọc client-side được — narrow qua ngày. `null`/undefined = bỏ.
   */
  dayOverride?: string | null;
}

/**
 * Bảng phẳng (KHÔNG group theo sản phẩm) cho trang Fulfillment "In". Hiển thị
 * tất cả đơn admin-like, sort ưu tiên type → size (sort=grouped ở BE), filter
 * đầy đủ + filter Tên sản phẩm (type) + Khách hàng (userSku) dạng dropdown, +
 * thanh chips trạng thái stage. Tách riêng để không đụng `OrderTableWorkshop`.
 */
export function PrintOrderTable({
  extraRowAction,
  extraActionLabel,
  reloadToken,
  isRowSelectable,
  renderBulkBar,
  dayOverride,
}: PrintOrderTableProps = {}) {
  const { canViewField, canEditField } = usePermission();
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);
  const isNoTool = useIsNoTool();

  // URL params (prefix `p` = print). F5 giữ nguyên filter/ngày/search/status/trang.
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('ppage'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const s = Number(searchParams.get('psize'));
    return Number.isFinite(s) && s > 0 ? s : DEFAULT_PAGE_SIZE;
  });
  const [createdFrom, setCreatedFrom] = useState(() => searchParams.get('pfrom') ?? todayISO());
  const [createdTo, setCreatedTo] = useState(() => searchParams.get('pto') ?? todayISO());
  const [search, setSearch] = useState(() => searchParams.get('psearch') || '');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('pstatus') || '');
  const [counts, setCounts] = useState<StatusCounts>(EMPTY_COUNTS);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const shiftKeyRef = useRef(false);

  // ─── Keyboard copy mode (chế độ phím ↑↓) ──────────────────────
  // Bật → dùng phím ↑/↓ để copy Production ID từng dòng. CHỈ dòng vừa copy
  // (dòng cursor đang trỏ) hiện ✓ — di chuyển cursor → ✓ nhảy theo, dòng cũ
  // mất tick. `cursorIndex` = dòng đang focus trong trang.
  const [keyboardMode, setKeyboardMode] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cursorIndex, setCursorIndex] = useState(-1);
  const cursorRef = useRef(-1);
  useEffect(() => {
    cursorRef.current = cursorIndex;
  }, [cursorIndex]);
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);

  const [preview, setPreview] = useState<{ url: string; originalUrl?: string; title: string; sourceUrl?: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; productionId: string } | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ id: string; productionId: string } | null>(null);

  const [workshopFilters, setWorkshopFilters] = useState<WorkshopAvailableFilters | null>(null);

  // Facet filter state — khởi tạo từ URL params (F5 giữ nguyên).
  const [fType, setFType] = useState(() => searchParams.get('ptype') || '');
  const [fUserSku, setFUserSku] = useState(() => searchParams.get('pusersku') || '');
  const [fFabricType, setFFabricType] = useState(() => searchParams.get('pfabric') || '');
  const [fMachineNumber, setFMachineNumber] = useState(() => searchParams.get('pmnum') || '');
  const [fPrintStatus, setFPrintStatus] = useState(() => searchParams.get('pprint') || '');
  const [fToolResult, setFToolResult] = useState(() => searchParams.get('ptool') || '');
  const [fToolResultNote, setFToolResultNote] = useState(() => searchParams.get('pnote') || '');
  const [fErrorFile, setFErrorFile] = useState(() => searchParams.get('perrfile') || '');
  const [fAssignee, setFAssignee] = useState(() => searchParams.get('passign') || '');
  const [fDesignerStatus, setFDesignerStatus] = useState(() => searchParams.get('pdstatus') || '');
  const [fProductionError, setFProductionError] = useState(() => searchParams.get('perror') || '');

  // Sync state → URL (replace). Ngày luôn ghi (kể cả rỗng khi user clear),
  // các filter còn lại strip khi rỗng để URL gọn.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        search ? sp.set('psearch', search) : sp.delete('psearch');
        sp.set('pfrom', createdFrom);
        sp.set('pto', createdTo);
        statusFilter ? sp.set('pstatus', statusFilter) : sp.delete('pstatus');
        fType ? sp.set('ptype', fType) : sp.delete('ptype');
        fUserSku ? sp.set('pusersku', fUserSku) : sp.delete('pusersku');
        fFabricType ? sp.set('pfabric', fFabricType) : sp.delete('pfabric');
        fMachineNumber ? sp.set('pmnum', fMachineNumber) : sp.delete('pmnum');
        fPrintStatus ? sp.set('pprint', fPrintStatus) : sp.delete('pprint');
        fToolResult ? sp.set('ptool', fToolResult) : sp.delete('ptool');
        fToolResultNote ? sp.set('pnote', fToolResultNote) : sp.delete('pnote');
        fErrorFile ? sp.set('perrfile', fErrorFile) : sp.delete('perrfile');
        fAssignee ? sp.set('passign', fAssignee) : sp.delete('passign');
        fDesignerStatus ? sp.set('pdstatus', fDesignerStatus) : sp.delete('pdstatus');
        fProductionError ? sp.set('perror', fProductionError) : sp.delete('perror');
        page > 1 ? sp.set('ppage', String(page)) : sp.delete('ppage');
        pageSize !== DEFAULT_PAGE_SIZE ? sp.set('psize', String(pageSize)) : sp.delete('psize');
        return sp;
      },
      { replace: true },
    );
  }, [
    search,
    createdFrom,
    createdTo,
    statusFilter,
    fType,
    fUserSku,
    fFabricType,
    fMachineNumber,
    fPrintStatus,
    fToolResult,
    fToolResultNote,
    fErrorFile,
    fAssignee,
    fDesignerStatus,
    fProductionError,
    page,
    pageSize,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  const visibleCols = useMemo(() => COLS.filter((c) => !c.perm || canViewField(c.key)), [canViewField]);

  // Build query params. `includeStatus`: kèm `fulfillmentStatus` (cho data +
  // facets để cả 2 narrow theo chip đang chọn). Counts KHÔNG kèm (đếm đủ 5).
  const buildBaseParams = (includeStatus: boolean): URLSearchParams => {
    const p = new URLSearchParams();
    if (debouncedSearch.trim()) p.set('search', debouncedSearch.trim());
    // dayOverride (click 1 ngày ở bảng tổng quan) ép cửa sổ về đúng ngày đó.
    const effFrom = dayOverride || createdFrom;
    const effTo = dayOverride || createdTo;
    if (effFrom) p.set('createdFrom', effFrom);
    if (effTo) p.set('createdTo', effTo);
    if (fType) p.set('type', fType);
    if (fUserSku) p.set('userSku', fUserSku);
    if (fFabricType) p.set('fabricType', fFabricType);
    if (fMachineNumber) p.set('machineNumber', fMachineNumber);
    if (fPrintStatus) p.set('printStatus', fPrintStatus);
    if (fToolResult) p.set('toolResult', fToolResult);
    if (fToolResultNote) p.set('toolResultNote', fToolResultNote);
    if (fErrorFile) p.set('errorFile', fErrorFile);
    if (fAssignee) p.set('assignee', fAssignee);
    if (fDesignerStatus) p.set('designerStatus', fDesignerStatus);
    if (fProductionError) p.set('productionError', fProductionError);
    if (includeStatus && statusFilter) p.set('fulfillmentStatus', statusFilter);
    return p;
  };

  const fetchData = async () => {
    const p = buildBaseParams(true);
    p.set('page', String(page));
    p.set('limit', String(pageSize));
    p.set('sort', 'grouped'); // ưu tiên type → size → fabric → inProductionAt
    try {
      const res = await RepositoryRemote.order.getOrders('?' + p.toString());
      // BE đã sort type → sizeRank → fabric → inProductionAt (sort=grouped).
      setItems((res.data?.data || []) as OrderRow[]);
      setTotal(res.data?.total || 0);
    } catch (err) {
      handleAxiosError(err);
    }
  };

  const fetchFilters = async () => {
    try {
      const res = await RepositoryRemote.order.getWorkshopFilters('?' + buildBaseParams(true).toString());
      setWorkshopFilters((res.data?.data || null) as WorkshopAvailableFilters | null);
    } catch (err) {
      handleAxiosError(err);
    }
  };

  const fetchCounts = async () => {
    try {
      const res = await RepositoryRemote.order.getFulfillmentStatusCounts('?' + buildBaseParams(false).toString());
      if (res.data?.data) setCounts(res.data.data as StatusCounts);
    } catch (err) {
      handleAxiosError(err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchData(), fetchFilters(), fetchCounts()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    pageSize,
    debouncedSearch,
    createdFrom,
    createdTo,
    statusFilter,
    fType,
    fUserSku,
    fFabricType,
    fMachineNumber,
    fPrintStatus,
    fToolResult,
    fToolResultNote,
    fErrorFile,
    fAssignee,
    fDesignerStatus,
    fProductionError,
    reloadToken,
    dayOverride,
  ]);

  const patchRow = (id: string, patch: Partial<OrderRow>) =>
    setItems((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));

  const openPreview = (url: string, title: string, originalUrl?: string, sourceUrl?: string) =>
    setPreview({ url, originalUrl, title, sourceUrl });
  const openDetail = (id: string, productionId: string) => setDetailTarget({ id, productionId });
  const renderCtx: WorkshopRenderCtx = { canEditField, patchRow, openPreview, openDetail };

  // ─── Selection (flat) — chỉ tick được đơn hợp lệ ──────────────
  const canSelect = (row: OrderRow) => (isRowSelectable ? isRowSelectable(row) : true);
  const selectableIds = useMemo(
    () => items.filter((r) => canSelect(r)).map((r) => r._id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, isRowSelectable],
  );
  const orderedIds = selectableIds;
  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAll = () =>
    setSelected((prev) => (allSelectableSelected ? new Set() : new Set(selectableIds)));

  const handleCheckboxChange = (id: string) => {
    const isShift = shiftKeyRef.current;
    shiftKeyRef.current = false;
    if (isShift && lastClickedId && lastClickedId !== id) {
      const a = orderedIds.indexOf(lastClickedId);
      const b = orderedIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        const range = orderedIds.slice(from, to + 1);
        const newState = !selected.has(id);
        setSelected((prev) => {
          const next = new Set(prev);
          for (const rid of range) newState ? next.add(rid) : next.delete(rid);
          return next;
        });
        setLastClickedId(id);
        return;
      }
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setLastClickedId(id);
  };

  const reload = () => {
    setLoading(true);
    Promise.all([fetchData(), fetchFilters(), fetchCounts()]).finally(() => setLoading(false));
  };

  // ─── Keyboard copy: copy 1 dòng + đánh dấu ✓ ──────────────────
  const copyProductionId = async (row: OrderRow) => {
    try {
      await navigator.clipboard.writeText(row.productionId);
      setCopiedId(row._id);
    } catch {
      toast.error('Không copy được — trình duyệt chặn clipboard');
    }
  };

  // Lắng nghe ↑/↓ khi bật keyboardMode. Bỏ qua khi đang gõ trong input/select.
  useEffect(() => {
    if (!keyboardMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (items.length === 0) return;
      e.preventDefault();
      const prev = cursorRef.current;
      let next: number;
      if (prev < 0) {
        next = e.key === 'ArrowDown' ? 0 : items.length - 1;
      } else {
        next =
          e.key === 'ArrowDown'
            ? Math.min(prev + 1, items.length - 1)
            : Math.max(prev - 1, 0);
      }
      cursorRef.current = next;
      setCursorIndex(next);
      const row = items[next];
      if (row) void copyProductionId(row);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardMode, items]);

  // Scroll dòng đang focus vào tầm nhìn.
  useEffect(() => {
    if (keyboardMode && cursorIndex >= 0) {
      activeRowRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [cursorIndex, keyboardMode]);

  // Xóa ✓ + cursor khi đổi filter/search/date/status/facet ("filter khác").
  // KHÔNG phụ thuộc `page`/`reloadToken` → sang trang / reload sau thao tác giữ ✓.
  useEffect(() => {
    setCopiedId(null);
    setCursorIndex(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch,
    createdFrom,
    createdTo,
    statusFilter,
    fType,
    fUserSku,
    fFabricType,
    fMachineNumber,
    fPrintStatus,
    fToolResult,
    fToolResultNote,
    fErrorFile,
    fAssignee,
    fDesignerStatus,
    fProductionError,
  ]);

  // Cursor trỏ vị trí trong trang hiện tại → reset index khi đổi trang (✓ giữ nguyên).
  useEffect(() => {
    setCursorIndex(-1);
  }, [page, pageSize]);

  const facets: OrderFilterFacet[] = [
    { key: 'type', label: 'Tên sản phẩm', value: fType, onChange: (v) => { setFType(v); setPage(1); }, options: workshopFilters?.type || [] },
    { key: 'userSku', label: 'Khách hàng (SKU)', value: fUserSku, onChange: (v) => { setFUserSku(v); setPage(1); }, options: workshopFilters?.userSku || [] },
    { key: 'fabricType', label: 'Loại vải', value: fFabricType, onChange: setFFabricType, options: workshopFilters?.fabricType || [], perm: 'order.field.fabricType.view' },
    { key: 'machineNumber', label: 'Máy', value: fMachineNumber, onChange: setFMachineNumber, options: workshopFilters?.machineNumber || [], perm: 'order.field.machineNumber.view' },
    { key: 'printStatus', label: 'Trạng thái in', value: fPrintStatus, onChange: setFPrintStatus, options: workshopFilters?.printStatus || [], perm: 'order.field.printStatus.view' },
    { key: 'toolResult', label: 'Kết quả Tool', value: fToolResult, onChange: setFToolResult, options: workshopFilters?.toolResult || [], perm: 'order.field.toolResult.view' },
    { key: 'toolResultNote', label: 'Note kq Tool', value: fToolResultNote, onChange: setFToolResultNote, options: workshopFilters?.toolResultNote || [], perm: 'order.field.toolResultNote.view' },
    { key: 'errorFile', label: 'File sửa lỗi', value: fErrorFile, onChange: setFErrorFile, options: workshopFilters?.errorFile || [], perm: 'order.field.errorFile.view' },
    { key: 'assignee', label: 'Người thực hiện', value: fAssignee, onChange: setFAssignee, options: workshopFilters?.assignee || [], perm: 'order.field.assignee.view' },
    { key: 'designerStatus', label: 'TT Designer', value: fDesignerStatus, onChange: setFDesignerStatus, options: workshopFilters?.designerStatus || [], perm: 'order.field.designerStatus.view' },
    { key: 'productionError', label: 'Lỗi xưởng', value: fProductionError, onChange: setFProductionError, options: workshopFilters?.productionError || [], perm: 'order.field.productionError.view' },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Chips trạng thái stage — hàng ngang + count */}
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value || 'all'}
                type="button"
                onClick={() => { setStatusFilter(tab.value); setPage(1); }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                <span className={active ? 'text-primary' : tab.accent}>{tab.label}</span>
                <span
                  className={cn(
                    'min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums',
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  {counts[tab.countKey]}
                </span>
              </button>
            );
          })}

          {/* Toggle chế độ copy bằng phím ↑↓ */}
          <button
            type="button"
            onClick={() => setKeyboardMode((v) => !v)}
            title="Bật/tắt copy Production ID bằng phím mũi tên ↑ ↓"
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              keyboardMode
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            <Keyboard size={14} />
            Chế độ phím ↑↓
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                keyboardMode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {keyboardMode ? 'On' : 'Off'}
            </span>
          </button>
        </div>

        <OrderFilterBar
          search={search}
          onSearchChange={setSearch}
          createdFrom={createdFrom}
          createdTo={createdTo}
          onDateRangeChange={(f, t) => { setCreatedFrom(f); setCreatedTo(t); setPage(1); }}
          onReload={reload}
          loading={loading}
          facets={facets}
        />

        <PaginationBar
          position="top"
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loading}
          onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
        />

        {keyboardMode && items.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-foreground">
            <Keyboard size={13} className="mt-0.5 shrink-0 text-primary" />
            <p>
              Nhấn{' '}
              <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">↑</kbd>{' '}
              <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">↓</kbd>{' '}
              để copy Production ID từng dòng. Chỉ dòng đang trỏ hiện dấu{' '}
              <CheckCircle2 size={11} className="inline text-emerald-500" /> — di chuyển
              cursor thì dấu nhảy theo.
            </p>
          </div>
        )}

        {!keyboardMode && selected.size === 0 && items.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <MousePointerClick size={13} className="mt-0.5 shrink-0 text-primary" />
            <p>
              Tick 1 đơn, giữ{' '}
              <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">Shift</kbd>{' '}
              rồi click checkbox khác để chọn nhanh tất cả đơn ở giữa.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 sticky left-0 z-30 bg-card">
                    <input
                      type="checkbox"
                      checked={allSelectableSelected}
                      disabled={selectableIds.length === 0}
                      onChange={toggleAll}
                      title="Chọn toàn bộ đơn hợp lệ trên trang"
                    />
                  </TableHead>
                  {visibleCols.map((c, i) => (
                    <TableHead
                      key={c.key}
                      className={cn(
                        'whitespace-nowrap text-xs',
                        c.width,
                        i === 0 && 'sticky left-8 z-30 bg-card shadow-[1px_0_0_0_var(--border)]',
                      )}
                    >
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-12"></TableHead>
                  {extraRowAction && (
                    <TableHead className="sticky right-0 z-30 bg-card whitespace-nowrap text-xs shadow-[-1px_0_0_0_var(--border)]">
                      {extraActionLabel ?? 'Thao tác'}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleCols.length + 2 + (extraRowAction ? 1 : 0)} className="text-center py-10">
                      <Spinner size={20} className="text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleCols.length + 2 + (extraRowAction ? 1 : 0)} className="text-center py-10 text-sm text-muted-foreground">
                      Không có đơn hàng nào phù hợp
                    </TableCell>
                  </TableRow>
                )}
                {items.map((row, idx) => {
                  const isSel = selected.has(row._id);
                  const selectable = canSelect(row);
                  const noTool = isNoTool(row.toolResult);
                  const isCopied = copiedId === row._id;
                  const isCursor = keyboardMode && idx === cursorIndex;
                  const rowBgClass = isSel
                    ? 'bg-primary/10 dark:bg-primary/20'
                    : noTool
                      ? 'bg-sky-100 dark:bg-sky-500/20'
                      : 'bg-card';
                  return (
                    <TableRow
                      key={row._id}
                      ref={isCursor ? activeRowRef : undefined}
                      className={cn(
                        rowBgClass,
                        noTool && 'border-l-2 border-l-sky-400 dark:border-l-sky-400/60',
                        isCursor && 'ring-2 ring-inset ring-primary',
                      )}
                    >
                      <TableCell className={cn('sticky left-0 z-10', rowBgClass)}>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={isSel}
                            disabled={!selectable}
                            onMouseDown={(e) => { shiftKeyRef.current = e.shiftKey; }}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => handleCheckboxChange(row._id)}
                            title={selectable ? 'Shift+click để chọn cả range' : 'Đơn không thao tác được ở stage In'}
                          />
                          {isCopied && (
                            <CheckCircle2
                              size={15}
                              className="shrink-0 text-emerald-500"
                              aria-label="Đã copy Production ID"
                            />
                          )}
                        </div>
                      </TableCell>
                      {visibleCols.map((c, i) => (
                        <TableCell
                          key={c.key}
                          className={cn('py-2', i === 0 && cn('sticky left-8 z-10 shadow-[1px_0_0_0_var(--border)]', rowBgClass))}
                        >
                          <div className="min-w-0">{c.render(row, renderCtx)}</div>
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Lịch sử"
                          onClick={() => setHistoryTarget({ id: row._id, productionId: row.productionId })}
                        >
                          <History size={13} className="text-muted-foreground" />
                        </Button>
                      </TableCell>
                      {extraRowAction && (
                        <TableCell className={cn('sticky right-0 z-10 shadow-[-1px_0_0_0_var(--border)]', rowBgClass)}>
                          {extraRowAction(row)}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            position="bottom"
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
          />
        </div>

        {renderBulkBar ? (
          selected.size > 0 &&
          renderBulkBar(
            items.filter((r) => selected.has(r._id)),
            () => setSelected(new Set()),
          )
        ) : (
          <BulkEditToolbar
            selectedIds={Array.from(selected)}
            onClear={() => setSelected(new Set())}
            onApplied={() => { setSelected(new Set()); reload(); }}
          />
        )}

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
      </div>
    </TooltipProvider>
  );
}
