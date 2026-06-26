import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, History, MousePointerClick, RefreshCw, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { WorkshopAvailableFilters } from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/common/PaginationBar';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { SelectFilter } from '@/components/common/SelectFilter';
import { Spinner } from '@/components/common/Spinner';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
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
import { OrderLogTimelineDialog } from '@/components/orders/OrderLogTimelineDialog';
import { DesignerSummaryPanel } from './DesignerSummaryPanel';
import {
  WORKSHOP_COLS,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { usePermission } from '@/hooks/usePermission';
import { usePendingDesignsPoll } from '@/hooks/usePendingDesignsPoll';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/utils/cn';

// Types and column config live in workshopTableConfig.tsx (shared with OrdersMiniTable).
type OrderRow = WorkshopOrderRow;
type RenderCtx = WorkshopRenderCtx;
const COLS = WORKSHOP_COLS;

// Pagination unit is product types (not rows). 20 products fits comfortably
// in the collapsed view; user can drill in via chevron.
const DEFAULT_PAGE_SIZE = 20;

function todayISO(): string {
  // Local date components — KHÔNG dùng toISOString() (UTC) vì sẽ trả hôm
  // trước khi ở UTC+ buổi sáng.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function OrderTableWorkshop() {
  const { has, canViewField, canEditField } = usePermission();
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
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());

  const toggleType = (t: string) =>
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

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
    page,
    pageSize,
    setSearchParams,
  ]);

  const [workshopFilters, setWorkshopFilters] = useState<WorkshopAvailableFilters | null>(null);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  const visibleCols = useMemo(
    () => COLS.filter((c) => !c.perm || canViewField(c.key)),
    [canViewField],
  );

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
    if (filterPrintStatus) params.set('printStatus', filterPrintStatus);
    if (filterToolResultNote) params.set('toolResultNote', filterToolResultNote);
    if (filterAssignee) params.set('assignee', filterAssignee);
    if (filterProductionError) params.set('productionError', filterProductionError);
    if (filterFabricType) params.set('fabricType', filterFabricType);
    if (filterMachineNumber) params.set('machineNumber', filterMachineNumber);
    if (filterToolResult) params.set('toolResult', filterToolResult);
    if (filterErrorFile) params.set('errorFile', filterErrorFile);
    if (filterDesignerStatus) params.set('designerStatus', filterDesignerStatus);
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
    filterPrintStatus,
    filterToolResultNote,
    filterAssignee,
    filterProductionError,
    filterFabricType,
    filterMachineNumber,
    filterToolResult,
    filterErrorFile,
    filterDesignerStatus,
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
  const patchRow = (id: string, patch: Partial<OrderRow>) => {
    setItems((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        orders: g.orders.map((r) => (r._id === id ? { ...r, ...patch } : r)),
      })),
    );
  };

  usePendingDesignsPoll(items, patchRow);

  const openPreview = (url: string, title: string, originalUrl?: string, sourceUrl?: string) =>
    setPreview({ url, originalUrl, title, sourceUrl });

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map((it) => it._id));
    });
  };

  /**
   * Flat ordered list of currently visible order IDs (đã skip groups bị
   * collapse). Phải khớp THỨ TỰ render dưới body — anchor index = idx trong
   * mảng này. Dùng cho shift+click range select.
   */
  const visibleOrderedIds = useMemo(() => {
    const out: string[] = [];
    for (const g of groups) {
      const t = g.type || '(không có tên)';
      if (collapsedTypes.has(t)) continue;
      const comboCount = new Map<string, number>();
      for (const r of g.orders) {
        const k = `${r.size || ''}|${r.fabricType || ''}|${r.mockupOriginalUrl || r.mockupUrl || ''}`;
        comboCount.set(k, (comboCount.get(k) || 0) + 1);
      }
      const sorted = [...g.orders].sort((a, b) => {
        const ka = `${a.size || ''}|${a.fabricType || ''}|${a.mockupOriginalUrl || a.mockupUrl || ''}`;
        const kb = `${b.size || ''}|${b.fabricType || ''}|${b.mockupOriginalUrl || b.mockupUrl || ''}`;
        const ca = comboCount.get(ka) || 1;
        const cb = comboCount.get(kb) || 1;
        if (cb !== ca) return cb - ca;
        return ka.localeCompare(kb);
      });
      for (const r of sorted) out.push(r._id);
    }
    return out;
  }, [groups, collapsedTypes]);

  /**
   * Excel-style range select. Native checkbox toggle chạy bình thường (visual
   * sync chính xác), state sync ở onChange. shiftKey lấy từ ref đã set ở
   * mousedown vì change event không carry modifier keys.
   *
   * Trước đó dùng preventDefault trên onClick → React skip update DOM `checked`
   * cho row vừa click → state đúng nhưng UI miss tick row cuối.
   */
  const handleCheckboxChange = (id: string) => {
    const isShift = shiftKeyRef.current;
    shiftKeyRef.current = false;
    if (isShift && lastClickedId && lastClickedId !== id) {
      const lastIdx = visibleOrderedIds.indexOf(lastClickedId);
      const curIdx = visibleOrderedIds.indexOf(id);
      if (lastIdx >= 0 && curIdx >= 0) {
        const [from, to] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        const range = visibleOrderedIds.slice(from, to + 1);
        // Native đã toggle row hiện tại — newState = trạng thái sau toggle.
        const newState = !selected.has(id);
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
    toggleRow(id);
    setLastClickedId(id);
  };

  type GroupSelectionState = 'all' | 'some' | 'none';
  const groupSelectionState = (orders: OrderRow[]): GroupSelectionState => {
    const total = orders.length;
    if (total === 0) return 'none';
    let count = 0;
    for (const o of orders) if (selected.has(o._id)) count++;
    if (count === 0) return 'none';
    if (count === total) return 'all';
    return 'some';
  };

  const toggleGroupSelection = (orders: OrderRow[]) => {
    const state = groupSelectionState(orders);
    setSelected((prev) => {
      const next = new Set(prev);
      if (state === 'all') {
        for (const o of orders) next.delete(o._id);
      } else {
        for (const o of orders) next.add(o._id);
      }
      return next;
    });
  };

  const renderCtx: RenderCtx = { canEditField, patchRow, openPreview };

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
      | null,
  ) => {
    if (userId !== null) setFilterAssignee(userId);
    if (status !== null) setFilterDesignerStatus(status);
    setPage(1);
  };

  // Build qs để pass vào panel — cùng shape với buildFilterParams nhưng
  // KHÔNG include `page/limit` (panel scoped theo filter, không pagination).
  const summaryFilterQs = useMemo(() => {
    return buildFilterParams().toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch,
    filterPrintStatus,
    filterToolResultNote,
    filterAssignee,
    filterProductionError,
    filterFabricType,
    filterMachineNumber,
    filterToolResult,
    filterErrorFile,
    filterDesignerStatus,
    createdFrom,
    createdTo,
  ]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {canSeeDesignerSummary && (
          <DesignerSummaryPanel
            filterQs={summaryFilterQs}
            onClickCell={handleSummaryCellClick}
          />
        )}

        {/* Filter bar */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm Production ID / SKU / Order ID / Type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <DateRangePicker
                from={createdFrom}
                to={createdTo}
                onChange={(f, t) => {
                  setCreatedFrom(f);
                  setCreatedTo(t);
                  setPage(1);
                }}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                Promise.all([fetchData(), fetchFilters()]).finally(() => setLoading(false));
              }}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Tải lại
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
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {has('order.field.fabricType.view') && (
              <SelectFilter
                label="Loại vải"
                value={filterFabricType}
                onChange={setFilterFabricType}
                options={workshopFilters?.fabricType || []}
              />
            )}
            {has('order.field.machineNumber.view') && (
              <SelectFilter
                label="Máy"
                value={filterMachineNumber}
                onChange={setFilterMachineNumber}
                options={workshopFilters?.machineNumber || []}
              />
            )}
            {has('order.field.printStatus.view') && (
              <SelectFilter
                label="Trạng thái in"
                value={filterPrintStatus}
                onChange={setFilterPrintStatus}
                options={workshopFilters?.printStatus || []}
              />
            )}
            {has('order.field.toolResult.view') && (
              <SelectFilter
                label="Kết quả Tool"
                value={filterToolResult}
                onChange={setFilterToolResult}
                options={workshopFilters?.toolResult || []}
              />
            )}
            {has('order.field.toolResultNote.view') && (
              <SelectFilter
                label="Note kq Tool"
                value={filterToolResultNote}
                onChange={setFilterToolResultNote}
                options={workshopFilters?.toolResultNote || []}
              />
            )}
            {has('order.field.errorFile.view') && (
              <SelectFilter
                label="File sửa lỗi"
                value={filterErrorFile}
                onChange={setFilterErrorFile}
                options={workshopFilters?.errorFile || []}
              />
            )}
            {has('order.field.assignee.view') && (
              <SelectFilter
                label="Người thực hiện"
                value={filterAssignee}
                onChange={setFilterAssignee}
                options={assigneeOptions}
              />
            )}
            {canSeeDesignerSummary && (
              <SelectFilter
                label="TT Designer"
                value={filterDesignerStatus}
                onChange={setFilterDesignerStatus}
                options={designerStatusOptions}
              />
            )}
            {has('order.field.productionError.view') && (
              <SelectFilter
                label="Lỗi xưởng"
                value={filterProductionError}
                onChange={setFilterProductionError}
                options={workshopFilters?.productionError || []}
              />
            )}
          </div>
        </div>

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selected.size === items.length}
                      onChange={toggleAll}
                      title="Tick để chọn toàn bộ đơn trên trang này"
                    />
                  </TableHead>
                  {visibleCols.map((c) => (
                    <TableHead key={c.key} className={cn('whitespace-nowrap text-xs', c.width)}>
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleCols.length + 2} className="text-center py-10">
                      <Spinner size={20} className="text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleCols.length + 2} className="text-center py-10 text-sm text-muted-foreground">
                      Không có đơn hàng nào phù hợp
                    </TableCell>
                  </TableRow>
                )}
                {groups.map((g) => {
                  const t = g.type || '(không có tên)';
                  const collapsed = collapsedTypes.has(t);

                  // Per-group: count combos (size+fabric+mockup) to drive ×N
                  // badges and the "max" highlight. Then sort orders so the
                  // heaviest combo floats to the top of the section.
                  const comboCount = new Map<string, number>();
                  for (const r of g.orders) {
                    const k = `${r.size || ''}|${r.fabricType || ''}|${r.mockupOriginalUrl || r.mockupUrl || ''}`;
                    comboCount.set(k, (comboCount.get(k) || 0) + 1);
                  }
                  const maxCombo = Math.max(0, ...Array.from(comboCount.values()));

                  const sortedOrders = collapsed
                    ? []
                    : [...g.orders].sort((a, b) => {
                        const ka = `${a.size || ''}|${a.fabricType || ''}|${a.mockupOriginalUrl || a.mockupUrl || ''}`;
                        const kb = `${b.size || ''}|${b.fabricType || ''}|${b.mockupOriginalUrl || b.mockupUrl || ''}`;
                        const ca = comboCount.get(ka) || 1;
                        const cb = comboCount.get(kb) || 1;
                        if (cb !== ca) return cb - ca;
                        return ka.localeCompare(kb);
                      });

                  const groupState = groupSelectionState(g.orders);
                  return (
                    <React.Fragment key={t}>
                      <TableRow className="bg-muted/40 hover:bg-muted/50">
                        <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={groupState === 'all'}
                            ref={(el) => {
                              if (el) el.indeterminate = groupState === 'some';
                            }}
                            onChange={() => toggleGroupSelection(g.orders)}
                            title={`Tick toàn bộ ${g.orders.length} đơn của sản phẩm này`}
                          />
                        </TableCell>
                        <TableCell
                          colSpan={visibleCols.length + 1}
                          className="py-1.5 cursor-pointer"
                          onClick={() => toggleType(t)}
                        >
                          <div className="flex items-center gap-2 text-xs">
                            {collapsed ? (
                              <ChevronRight size={14} className="text-muted-foreground" />
                            ) : (
                              <ChevronDown size={14} className="text-muted-foreground" />
                            )}
                            <span className="font-semibold text-foreground line-clamp-1">{t}</span>
                            <Badge variant="secondary" className="font-mono">
                              {g.totalOrders} đơn
                            </Badge>
                            {groupState !== 'none' && (
                              <Badge variant="success" className="font-mono text-[10px]">
                                {g.orders.filter((o) => selected.has(o._id)).length}/{g.orders.length} chọn
                              </Badge>
                            )}
                            {maxCombo > 1 && (
                              <Badge
                                variant="warning"
                                className="font-mono text-[10px]"
                                title="Combo (size + vải + mockup) trùng nhiều nhất trong nhóm"
                              >
                                max ×{maxCombo}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {sortedOrders.map((row) => {
                        const comboKey = `${row.size || ''}|${row.fabricType || ''}|${row.mockupOriginalUrl || row.mockupUrl || ''}`;
                        const comboN = comboCount.get(comboKey) || 1;
                        const isHeaviest = comboN > 1 && comboN === maxCombo;
                        return (
                          <TableRow
                            key={row._id}
                            className={cn(
                              selected.has(row._id) && 'bg-primary/5',
                              isHeaviest && !selected.has(row._id) && 'bg-amber-50/60 dark:bg-amber-500/5',
                            )}
                          >
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={selected.has(row._id)}
                                onMouseDown={(e) => {
                                  shiftKeyRef.current = e.shiftKey;
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => handleCheckboxChange(row._id)}
                                title="Shift+click để chọn cả range tới checkbox trước đó"
                              />
                            </TableCell>
                            {visibleCols.map((c) => (
                              <TableCell key={c.key} className="py-2">
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
                                  <div className="min-w-0 flex-1">{c.render(row, renderCtx)}</div>
                                </div>
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
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
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
      </div>
    </TooltipProvider>
  );
}

