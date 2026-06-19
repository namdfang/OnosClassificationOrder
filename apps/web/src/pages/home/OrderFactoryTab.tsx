import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Download, Factory, History, RefreshCw, Send } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { FactoryFilterOption, FactoryOverview, FactoryOverviewCell } from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/common/Spinner';
import { PaginationBar } from '@/components/common/PaginationBar';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { OrderLogTimelineDialog } from '@/components/orders/OrderLogTimelineDialog';
import {
  WORKSHOP_COLS,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import { usePermission } from '@/hooks/usePermission';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { cn } from '@/utils/cn';

import { buildWorkbook, downloadWorkbook, type ExportableOrder } from './exportOrders';

type PrintStage = 'printed' | 'printing' | 'not-printed';

type FilterMode =
  | { kind: 'all' }
  | { kind: 'at'; factoryId: string }
  | { kind: 'in'; factoryId: string }   // transferred-in to factoryId
  | { kind: 'out'; factoryId: string }  // transferred-out from factoryId
  | { kind: 'print'; factoryId: string; stage: PrintStage }
  | { kind: 'error'; factoryId: string }; // đơn lỗi xưởng tại factoryId

interface SelectFilters {
  type: string;
  fabric: string;
  tool: string;
  machine: string;
}

function todayISO() {
  // Local date — `toISOString()` would shift to UTC and return yesterday for
  // UTC+ timezones in the morning.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const DEFAULT_PAGE_SIZE = 20;

// URL params dùng prefix `f` (factory) để không clash với param của status tab.
// Ví dụ URL khôi phục đầy đủ:
//   /dashboard?tab=factory&ffrom=2026-06-18&fto=2026-06-18&ffactory=<id>&fstage=printed&ftype=Tee
function parseFilterModeFromURL(sp: URLSearchParams): FilterMode {
  const fid = sp.get('ffactory');
  const stage = sp.get('fstage') as PrintStage | null;
  const mode = sp.get('fmode');
  if (!fid) return { kind: 'all' };
  if (stage === 'printed' || stage === 'printing' || stage === 'not-printed') {
    return { kind: 'print', factoryId: fid, stage };
  }
  if (mode === 'error') return { kind: 'error', factoryId: fid };
  if (mode === 'in') return { kind: 'in', factoryId: fid };
  if (mode === 'out') return { kind: 'out', factoryId: fid };
  return { kind: 'at', factoryId: fid };
}

export default function OrderFactoryTab() {
  const { canViewField, canEditField, has, isAdmin } = usePermission();
  const canTransfer = isAdmin || has('order.transfer');
  const [searchParams, setSearchParams] = useSearchParams();

  // Inline cells (fabric / tool / printStatus / assignee …) resolve their
  // dropdown options + labels through the workshop config store — make sure
  // it's loaded before rows render. Each tab is mounted independently so we
  // can't rely on another page having warmed the cache.
  const loadWorkshopConfig = useWorkshopConfigStore((s) => s.load);
  const workshopConfigLoaded = useWorkshopConfigStore((s) => s.loaded);
  useEffect(() => {
    if (!workshopConfigLoaded) loadWorkshopConfig();
  }, [workshopConfigLoaded, loadWorkshopConfig]);

  // Date filters default to today on every mount. Workshop staff scan
  // "today's orders" by default; widen the range manually if needed.
  // F5 / reload đọc lại từ URL params nếu có.
  const [createdFrom, setCreatedFrom] = useState(() => searchParams.get('ffrom') || todayISO());
  const [createdTo, setCreatedTo] = useState(() => searchParams.get('fto') || todayISO());

  const [overview, setOverview] = useState<FactoryOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const [filterMode, setFilterMode] = useState<FilterMode>(() => parseFilterModeFromURL(searchParams));
  const [selectFilters, setSelectFilters] = useState<SelectFilters>(() => ({
    type: searchParams.get('ftype') || '',
    fabric: searchParams.get('ffabric') || '',
    tool: searchParams.get('ftool') || '',
    machine: searchParams.get('fmachine') || '',
  }));

  const [rows, setRows] = useState<WorkshopOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const resolveWorkshop = useWorkshopConfigStore((s) => s.resolve);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('fpage'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const s = Number(searchParams.get('fsize'));
    return Number.isFinite(s) && s > 0 ? s : DEFAULT_PAGE_SIZE;
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Sync state → URL (replace để không spam history). Mỗi state đổi → cập
  // nhật URL, F5 sẽ đọc lại đúng. Date LUÔN ghi vào URL (kể cả today) để
  // URL reflect đúng state user thấy; page/size default thì strip để gọn.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        // Date luôn ghi
        createdFrom ? sp.set('ffrom', createdFrom) : sp.delete('ffrom');
        createdTo ? sp.set('fto', createdTo) : sp.delete('fto');
        // Filter mode
        sp.delete('ffactory');
        sp.delete('fmode');
        sp.delete('fstage');
        if (filterMode.kind !== 'all') {
          sp.set('ffactory', filterMode.factoryId);
          if (filterMode.kind === 'print') {
            sp.set('fstage', filterMode.stage);
          } else if (filterMode.kind === 'error') {
            sp.set('fmode', 'error');
          } else if (filterMode.kind !== 'at') {
            sp.set('fmode', filterMode.kind);
          }
        }
        // Select filters
        selectFilters.type ? sp.set('ftype', selectFilters.type) : sp.delete('ftype');
        selectFilters.fabric ? sp.set('ffabric', selectFilters.fabric) : sp.delete('ffabric');
        selectFilters.tool ? sp.set('ftool', selectFilters.tool) : sp.delete('ftool');
        selectFilters.machine ? sp.set('fmachine', selectFilters.machine) : sp.delete('fmachine');
        // Pagination
        page > 1 ? sp.set('fpage', String(page)) : sp.delete('fpage');
        pageSize !== DEFAULT_PAGE_SIZE ? sp.set('fsize', String(pageSize)) : sp.delete('fsize');
        return sp;
      },
      { replace: true },
    );
  }, [createdFrom, createdTo, filterMode, selectFilters, page, pageSize, setSearchParams]);

  const [preview, setPreview] = useState<{ url: string; originalUrl?: string; title: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; productionId: string } | null>(null);
  const [transferDialog, setTransferDialog] = useState<{ ids: string[] } | null>(null);

  // Overview query — includes the factory scope so dropdown options below
  // shrink to match the selected factory chip. Print-stage filter cũng dùng
  // factory scope vì luôn gắn với 1 xưởng cụ thể, và truyền thêm printStage
  // để BE thu hẹp availableFilters chỉ còn options của stage đó.
  const overviewQuery = useMemo(() => {
    const sp = new URLSearchParams();
    if (createdFrom) sp.set('createdFrom', createdFrom);
    if (createdTo) sp.set('createdTo', createdTo);
    if (filterMode.kind === 'at' || filterMode.kind === 'print' || filterMode.kind === 'error') {
      sp.set('factoryId', filterMode.factoryId);
    }
    if (filterMode.kind === 'print') {
      sp.set('printStage', filterMode.stage);
    }
    if (filterMode.kind === 'error') {
      sp.set('hasError', 'true');
    }
    return sp.toString();
  }, [createdFrom, createdTo, filterMode]);

  const fetchOverview = useCallback(async () => {
    try {
      setOverviewLoading(true);
      const res = await RepositoryRemote.order.getFactoryOverview(
        overviewQuery ? '?' + overviewQuery : '',
      );
      setOverview((res.data?.data || null) as FactoryOverview | null);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setOverviewLoading(false);
    }
  }, [overviewQuery]);

  const fetchRows = useCallback(async () => {
    const sp = new URLSearchParams();
    if (createdFrom) sp.set('createdFrom', createdFrom);
    if (createdTo) sp.set('createdTo', createdTo);
    sp.set('page', String(page));
    sp.set('limit', String(pageSize));
    sp.set('sort', 'grouped');
    if (filterMode.kind === 'at') sp.set('factoryId', filterMode.factoryId);
    if (filterMode.kind === 'in') sp.set('transferStatus', `transferred-in:${filterMode.factoryId}`);
    if (filterMode.kind === 'out') sp.set('transferStatus', `transferred-out:${filterMode.factoryId}`);
    if (filterMode.kind === 'print') {
      sp.set('factoryId', filterMode.factoryId);
      sp.set('printStage', filterMode.stage);
    }
    if (filterMode.kind === 'error') {
      sp.set('factoryId', filterMode.factoryId);
      sp.set('hasError', 'true');
    }
    if (selectFilters.type) sp.set('type', selectFilters.type);
    if (selectFilters.fabric) sp.set('fabricType', selectFilters.fabric);
    if (selectFilters.tool) sp.set('toolResult', selectFilters.tool);
    if (selectFilters.machine) sp.set('machineTypeId', selectFilters.machine);
    try {
      setRowsLoading(true);
      const res = await RepositoryRemote.order.getOrders('?' + sp.toString());
      setRows((res.data?.data || []) as WorkshopOrderRow[]);
      setTotal(res.data?.total || 0);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setRowsLoading(false);
    }
  }, [createdFrom, createdTo, page, pageSize, filterMode, selectFilters]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Skip 2 cleanup useEffect dưới đây trong mount đầu — nếu không sẽ ghi đè
  // state đã đọc từ URL (vd. F5 với `?fpage=3&ftype=Tee` sẽ bị reset về 1+rỗng).
  const isFirstRender = React.useRef(true);
  useEffect(() => {
    if (isFirstRender.current) return;
    setPage(1);
  }, [filterMode, pageSize, selectFilters]);

  // When user changes the factory chip the scope of available options shifts.
  // Stale selections (e.g. a product that only exists at the previous factory)
  // would silently return zero rows — clear them so the new scope is honest.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSelectFilters({ type: '', fabric: '', tool: '', machine: '' });
  }, [filterMode]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const visibleCols = useMemo(
    () => WORKSHOP_COLS.filter((c) => !c.perm || canViewField(c.key)),
    [canViewField],
  );

  const patchRow = (id: string, p: Partial<WorkshopOrderRow>) =>
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...p } : r)));

  const openPreview = (url: string, title: string, originalUrl?: string) =>
    setPreview({ url, originalUrl, title });

  const ctx: WorkshopRenderCtx = { canEditField, patchRow, openPreview };

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r._id))));

  const onAfterTransfer = () => {
    setSelected(new Set());
    setTransferDialog(null);
    fetchOverview();
    fetchRows();
  };

  // Export ALL rows matching the CURRENT filter — bypasses pagination, sends
  // the same query params as `fetchRows` minus page/limit. Names (fabric,
  // tool result, assignee…) get resolved on the client through the workshop
  // config store so the spreadsheet reads in Vietnamese.
  const handleExport = async () => {
    const sp = new URLSearchParams();
    if (createdFrom) sp.set('createdFrom', createdFrom);
    if (createdTo) sp.set('createdTo', createdTo);
    if (filterMode.kind === 'at') sp.set('factoryId', filterMode.factoryId);
    if (filterMode.kind === 'in') sp.set('transferStatus', `transferred-in:${filterMode.factoryId}`);
    if (filterMode.kind === 'out') sp.set('transferStatus', `transferred-out:${filterMode.factoryId}`);
    if (filterMode.kind === 'print') {
      sp.set('factoryId', filterMode.factoryId);
      sp.set('printStage', filterMode.stage);
    }
    if (filterMode.kind === 'error') {
      sp.set('factoryId', filterMode.factoryId);
      sp.set('hasError', 'true');
    }
    if (selectFilters.type) sp.set('type', selectFilters.type);
    if (selectFilters.fabric) sp.set('fabricType', selectFilters.fabric);
    if (selectFilters.tool) sp.set('toolResult', selectFilters.tool);
    if (selectFilters.machine) sp.set('machineTypeId', selectFilters.machine);
    try {
      setExportLoading(true);
      const res = await RepositoryRemote.order.exportOrders('?' + sp.toString());
      const data = (res.data?.data || []) as ExportableOrder[];
      if (data.length === 0) {
        toast.warning('Không có đơn nào để xuất');
        return;
      }
      // Reuse the overview already loaded for the visible tab — it reflects
      // the same date range + factory scope, so the Summary sheet matches what
      // the user sees on screen.
      const wb = buildWorkbook(data, overview, { resolve: resolveWorkshop });
      const stamp = new Date()
        .toLocaleString('sv-SE', { hour12: false })
        .replace(/[: ]/g, '-');
      downloadWorkbook(`don-hang-${stamp}.xlsx`, wb);
      toast.success(`Đã xuất ${data.length} đơn + summary`);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Date range + refresh */}
        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-2 flex-wrap">
          <DateRangePicker
            from={createdFrom}
            to={createdTo}
            onChange={(f, t) => {
              setCreatedFrom(f);
              setCreatedTo(t);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchOverview();
              fetchRows();
            }}
            disabled={overviewLoading || rowsLoading}
          >
            <RefreshCw size={13} className={overviewLoading || rowsLoading ? 'animate-spin' : ''} />
            Tải lại
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportLoading || rowsLoading}
            title="Xuất tất cả đơn theo filter hiện tại (bỏ qua phân trang)"
          >
            {exportLoading ? (
              <Spinner size={13} className="text-muted-foreground" />
            ) : (
              <Download size={13} />
            )}
            Xuất Excel
          </Button>
          {overview && (
            <span className="ml-auto text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{overview.totals.total}</span> đơn ·{' '}
              <span className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                {overview.totals.transferred}
              </span>{' '}
              đã chuyển
            </span>
          )}
        </div>


        {/* Factory cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(overview?.factories || []).map((f) => (
            <FactoryCard
              key={f.factoryId}
              cell={f}
              filterMode={filterMode}
              onFilter={setFilterMode}
            />
          ))}
          {!overview && overviewLoading && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg bg-muted/30 animate-pulse h-[130px]" />
              ))}
            </>
          )}
        </div>

        {/* Flow visualization */}
        {overview && overview.flows.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ArrowRight size={14} /> Luồng chuyển xưởng
              </h3>
              <span className="text-[11px] text-muted-foreground">Click để lọc bảng đơn</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {overview.flows.map((f) => {
                const active =
                  filterMode.kind === 'in' && filterMode.factoryId === f.toFactoryId;
                return (
                  <button
                    key={`${f.fromFactoryId}-${f.toFactoryId}`}
                    type="button"
                    onClick={() => setFilterMode({ kind: 'in', factoryId: f.toFactoryId })}
                    className={cn(
                      'flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                      active
                        ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-500/10'
                        : 'border-border hover:bg-muted/30',
                    )}
                  >
                    <Badge variant="secondary" className="font-mono">
                      {f.fromShortName || f.fromName}
                    </Badge>
                    <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                    <Badge variant="success" className="font-mono">
                      {f.toShortName || f.toName}
                    </Badge>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-bold tabular-nums">{f.count} đơn</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {f.totalQuantity} sản phẩm
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter chip bar */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Lọc:</span>
            <FilterChip
              active={filterMode.kind === 'all'}
              onClick={() => setFilterMode({ kind: 'all' })}
            >
              Tất cả
            </FilterChip>
            {(overview?.factories || []).map((f) => {
              // Chip "Đang ở X" hiện active khi user chọn factory chip HOẶC
              // đang ở print-stage / lỗi-xưởng drill-down của factory đó —
              // cả 3 mode đều giới hạn data về xưởng X.
              const atOrPrint =
                (filterMode.kind === 'at' || filterMode.kind === 'print' || filterMode.kind === 'error') &&
                filterMode.factoryId === f.factoryId;
              return (
                <FilterChip
                  key={`at-${f.factoryId}`}
                  active={atOrPrint}
                  onClick={() =>
                    setFilterMode(
                      atOrPrint && filterMode.kind === 'at'
                        ? { kind: 'all' }
                        : { kind: 'at', factoryId: f.factoryId },
                    )
                  }
                >
                  Đang ở {f.factoryShortName || f.factoryName}
                </FilterChip>
              );
            })}
            {filterMode.kind === 'print' && (
              <FilterChip active onClick={() => setFilterMode({ kind: 'all' })}>
                {filterMode.stage === 'printed' ? 'Đã in xong' : filterMode.stage === 'printing' ? 'Đang in' : 'Chưa in'}
              </FilterChip>
            )}
            {filterMode.kind === 'error' && (
              <FilterChip active onClick={() => setFilterMode({ kind: 'all' })}>
                Lỗi xưởng
              </FilterChip>
            )}
            {(filterMode.kind !== 'all' ||
              selectFilters.type ||
              selectFilters.fabric ||
              selectFilters.tool ||
              selectFilters.machine) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 ml-auto"
                onClick={() => {
                  setFilterMode({ kind: 'all' });
                  setSelectFilters({ type: '', fabric: '', tool: '', machine: '' });
                }}
              >
                Xóa lọc
              </Button>
            )}
          </div>

          {/* Select filters — options come from BE `availableFilters`
              reflecting only what's present in the date range, so user never
              sees options that yield empty results. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SelectFilter
              label="Sản phẩm"
              value={selectFilters.type}
              onChange={(v) => setSelectFilters((s) => ({ ...s, type: v }))}
              options={overview?.availableFilters.products || []}
            />
            <SelectFilter
              label="Loại vải"
              value={selectFilters.fabric}
              onChange={(v) => setSelectFilters((s) => ({ ...s, fabric: v }))}
              options={overview?.availableFilters.fabrics || []}
            />
            <SelectFilter
              label="Loại máy"
              value={selectFilters.machine}
              onChange={(v) => setSelectFilters((s) => ({ ...s, machine: v }))}
              options={overview?.availableFilters.machineTypes || []}
            />
            <SelectFilter
              label="Kết quả Tool"
              value={selectFilters.tool}
              onChange={(v) => setSelectFilters((s) => ({ ...s, tool: v }))}
              options={overview?.availableFilters.toolResults || []}
            />
          </div>
        </div>

        {/* Bulk transfer toolbar */}
        {canTransfer && selected.size > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
            <span className="text-sm font-medium">
              Đã chọn <span className="tabular-nums font-bold">{selected.size}</span> đơn
            </span>
            <Button
              size="sm"
              onClick={() => setTransferDialog({ ids: Array.from(selected) })}
            >
              <Send size={13} /> Chuyển xưởng
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
          </div>
        )}

        <PaginationBar
          position="top"
          page={page}
          pageSize={pageSize}
          total={total}
          loading={rowsLoading && rows.length === 0}
          onChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
        />

        {/* Orders table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden relative">
          <div
            className={cn(
              'absolute top-0 left-0 right-0 h-0.5 overflow-hidden bg-primary/10 pointer-events-none transition-opacity duration-200 z-10',
              rowsLoading ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div className="h-full w-1/4 bg-primary animate-indeterminate-bar" />
          </div>

          <div className="border-b border-border px-3 py-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Danh sách đơn ({total})
              {rowsLoading && rows.length > 0 && (
                <Spinner size={11} className="text-muted-foreground" />
              )}
            </h3>
          </div>

          <div className={cn('overflow-x-auto transition-opacity duration-300', rowsLoading && rows.length > 0 && 'opacity-60')}>
            <Table>
              <TableHeader>
                <TableRow>
                  {canTransfer && (
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selected.size === rows.length}
                        onChange={toggleAll}
                      />
                    </TableHead>
                  )}
                  <TableHead className="min-w-[150px]">Xưởng (đang / gốc)</TableHead>
                  {visibleCols.map((c) => (
                    <TableHead key={c.key} className={cn('whitespace-nowrap text-xs', c.width)}>
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleCols.length + 3} className="text-center py-8">
                      <Spinner size={18} className="text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                )}
                {!rowsLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={visibleCols.length + 3}
                      className="text-center py-8 text-sm text-muted-foreground"
                    >
                      Không có đơn nào phù hợp
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => {
                  const isTransferred =
                    !!row.originalFactoryId &&
                    !!row.factoryId &&
                    row.originalFactoryId !== row.factoryId;
                  const originalMeta = overview?.factories.find((f) => f.factoryId === row.originalFactoryId);
                  return (
                    <TableRow key={row._id} className={selected.has(row._id) ? 'bg-primary/5' : ''}>
                      {canTransfer && (
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selected.has(row._id)}
                            onChange={() => toggleRow(row._id)}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-col gap-1 text-[11px]">
                          {row.factory?.name ? (
                            <Badge variant={isTransferred ? 'warning' : 'success'} className="w-fit">
                              {row.factory.shortName || '?'} · {row.factory.name}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="w-fit">
                              Chưa map
                            </Badge>
                          )}
                          {isTransferred && (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <span>← Gốc:</span>
                              <Badge variant="secondary" className="font-mono text-[10px] py-0">
                                {originalMeta?.factoryShortName || originalMeta?.factoryName || '?'}
                              </Badge>
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {visibleCols.map((c) => (
                        <TableCell key={c.key} className="py-2">
                          {c.render(row, ctx)}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Lịch sử"
                          onClick={() =>
                            setHistoryTarget({ id: row._id, productionId: row.productionId })
                          }
                        >
                          <History size={13} className="text-muted-foreground" />
                        </Button>
                      </TableCell>
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
            loading={rowsLoading && rows.length === 0}
            onChange={(p, ps) => {
              setPage(p);
              setPageSize(ps);
            }}
          />
        </div>

        <ImagePreviewDialog
          open={!!preview}
          onOpenChange={(o) => !o && setPreview(null)}
          url={preview?.url}
          originalUrl={preview?.originalUrl}
          title={preview?.title}
        />
        <OrderLogTimelineDialog
          open={!!historyTarget}
          onOpenChange={(o) => !o && setHistoryTarget(null)}
          orderId={historyTarget?.id}
          productionId={historyTarget?.productionId}
        />

        <TransferDialog
          open={!!transferDialog}
          onOpenChange={(o) => !o && setTransferDialog(null)}
          ids={transferDialog?.ids || []}
          factories={overview?.factories || []}
          onSuccess={onAfterTransfer}
        />
      </div>
    </TooltipProvider>
  );
}

function FactoryCard({
  cell,
  filterMode,
  onFilter,
}: {
  cell: FactoryOverviewCell;
  filterMode: FilterMode;
  onFilter: (m: FilterMode) => void;
}) {
  const isAt = filterMode.kind === 'at' && filterMode.factoryId === cell.factoryId;
  const isIn = filterMode.kind === 'in' && filterMode.factoryId === cell.factoryId;
  const isOut = filterMode.kind === 'out' && filterMode.factoryId === cell.factoryId;
  const isError = filterMode.kind === 'error' && filterMode.factoryId === cell.factoryId;
  const activeStage =
    filterMode.kind === 'print' && filterMode.factoryId === cell.factoryId
      ? filterMode.stage
      : null;
  const togglePrint = (stage: PrintStage) =>
    onFilter(activeStage === stage ? { kind: 'all' } : { kind: 'print', factoryId: cell.factoryId, stage });
  const toggleError = () =>
    onFilter(isError ? { kind: 'all' } : { kind: 'error', factoryId: cell.factoryId });
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 transition-colors',
        isAt ? 'border-primary ring-2 ring-primary/20' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center">
          <Factory size={18} className="text-sky-600 dark:text-sky-400" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">
            {cell.factoryName}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            mã: {cell.factoryShortName || '—'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onFilter(isAt ? { kind: 'all' } : { kind: 'at', factoryId: cell.factoryId })}
        className="w-full text-left mb-2 group"
      >
        <p className="text-2xl font-bold tabular-nums group-hover:text-primary transition-colors">
          {cell.total}
        </p>
        <p className="text-[11px] text-muted-foreground">đang sản xuất tại đây</p>
      </button>
      {/* Per-factory mini stats */}
      <div className="grid grid-cols-4 gap-1 text-[10px] mb-2 pb-2 border-b border-border">
        <div className="text-center">
          <p className="font-bold tabular-nums text-sm text-foreground">{cell.productCount}</p>
          <p className="text-muted-foreground">sản phẩm</p>
        </div>
        <div className="text-center">
          <p className="font-bold tabular-nums text-sm text-foreground">{cell.fabricCount}</p>
          <p className="text-muted-foreground">loại vải</p>
        </div>
        <div className="text-center">
          <p className="font-bold tabular-nums text-sm text-foreground">{cell.machineCount}</p>
          <p className="text-muted-foreground">loại máy</p>
        </div>
        <div className="text-center">
          <p className="font-bold tabular-nums text-sm text-emerald-700 dark:text-emerald-400">
            {cell.withToolCount}
          </p>
          <p className="text-muted-foreground">có tool</p>
        </div>
      </div>
      {/* Print pipeline — Chưa in / Lỗi xưởng / Đã in xong. "Đang in" tạm
          bỏ; ô giữa giờ là số đơn xưởng báo lỗi (productionError set). */}
      <div className="grid grid-cols-3 gap-1.5 text-xs mb-2">
        <PrintStageBtn
          label="Chưa in"
          count={cell.notPrintedCount}
          active={activeStage === 'not-printed'}
          onClick={() => togglePrint('not-printed')}
          tone="slate"
        />
        <PrintStageBtn
          label="Lỗi xưởng"
          count={cell.errorCount}
          active={isError}
          onClick={toggleError}
          tone="rose"
        />
        <PrintStageBtn
          label="Đã in xong"
          count={cell.printedCount}
          active={activeStage === 'printed'}
          onClick={() => togglePrint('printed')}
          tone="emerald"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          onClick={() => onFilter(isIn ? { kind: 'all' } : { kind: 'in', factoryId: cell.factoryId })}
          className={cn(
            'rounded-md border px-2 py-1.5 text-left transition-colors',
            isIn ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-500/10' : 'border-border hover:bg-muted/30',
          )}
        >
          <p className="text-[10px] text-muted-foreground">Nhận từ xưởng khác</p>
          <p className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
            {cell.transferredIn}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onFilter(isOut ? { kind: 'all' } : { kind: 'out', factoryId: cell.factoryId })}
          className={cn(
            'rounded-md border px-2 py-1.5 text-left transition-colors',
            isOut ? 'border-slate-400 bg-slate-50/60 dark:bg-slate-500/10' : 'border-border hover:bg-muted/30',
          )}
        >
          <p className="text-[10px] text-muted-foreground">Đã chuyển đi</p>
          <p className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-300">
            {cell.transferredOut}
          </p>
        </button>
      </div>
    </div>
  );
}

function PrintStageBtn({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone: 'slate' | 'sky' | 'emerald' | 'rose';
}) {
  const toneClasses = {
    slate: { active: 'border-slate-400 bg-slate-50/60 dark:bg-slate-500/10', count: 'text-slate-700 dark:text-slate-300' },
    sky:    { active: 'border-sky-400 bg-sky-50/60 dark:bg-sky-500/10',       count: 'text-sky-700 dark:text-sky-300' },
    emerald:{ active: 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-500/10', count: 'text-emerald-700 dark:text-emerald-400' },
    rose:   { active: 'border-rose-400 bg-rose-50/60 dark:bg-rose-500/10',           count: 'text-rose-700 dark:text-rose-400' },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-1.5 text-left transition-colors',
        active ? toneClasses.active : 'border-border hover:bg-muted/30',
      )}
    >
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums', toneClasses.count)}>{count}</p>
    </button>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: FactoryFilterOption[];
}) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          value ? 'border-primary' : 'border-input',
        )}
      >
        <option value="">— Tất cả ({options.reduce((s, o) => s + o.count, 0)}) —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary font-medium'
          : 'border-border bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function TransferDialog({
  open,
  onOpenChange,
  ids,
  factories,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ids: string[];
  factories: FactoryOverviewCell[];
  onSuccess: () => void;
}) {
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setTarget('');
      setReason('');
    }
  }, [open]);

  const submit = async () => {
    if (!target) {
      toast.error('Chọn xưởng đích');
      return;
    }
    try {
      setSaving(true);
      const res = await RepositoryRemote.order.bulkTransferOrders({
        ids,
        targetFactoryId: target,
        reason: reason.trim() || undefined,
      });
      toast.success(`Đã chuyển ${res.data.data.modified}/${res.data.data.matched} đơn`);
      onSuccess();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chuyển {ids.length} đơn sang xưởng khác</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Xưởng đích</Label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— Chọn —</option>
              {factories.map((f) => (
                <option key={f.factoryId} value={f.factoryId}>
                  {f.factoryShortName ? `${f.factoryShortName} · ${f.factoryName}` : f.factoryName}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Xưởng gốc của từng đơn vẫn được lưu để theo dõi luồng chuyển.
            </p>
          </div>
          <div>
            <Label className="text-xs">Lý do (tùy chọn)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Xưởng A hết tải, chuyển sang B"
              className="mt-1 text-sm"
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={saving || !target}>
            {saving ? <Spinner size={13} /> : <Send size={13} />} Xác nhận chuyển
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

