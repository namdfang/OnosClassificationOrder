import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, History, RefreshCw, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/common/Pagination';
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
import {
  WORKSHOP_COLS,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { usePermission } from '@/hooks/usePermission';
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

export function OrderTableWorkshop() {
  const { has, canViewField, canEditField } = usePermission();
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);

  const [items, setItems] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ url: string; originalUrl?: string; title: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; productionId: string } | null>(null);
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());

  const toggleType = (t: string) =>
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  // Filters by workshop code (multi)
  const [filterPrintStatus, setFilterPrintStatus] = useState<string[]>([]);
  const [filterToolResultNote, setFilterToolResultNote] = useState<string[]>([]);
  const [filterAssignee, setFilterAssignee] = useState<string[]>([]);

  const byCategory = useWorkshopConfigStore((s) => s.byCategory);

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

  const fetchData = async () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(pageSize));
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (filterPrintStatus.length > 0) params.set('printStatus', filterPrintStatus.join(','));
    if (filterToolResultNote.length > 0) params.set('toolResultNote', filterToolResultNote.join(','));
    if (filterAssignee.length > 0) params.set('assignee', filterAssignee.join(','));
    if (createdFrom) params.set('createdFrom', createdFrom);
    if (createdTo) params.set('createdTo', createdTo);

    try {
      setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch, filterPrintStatus.join(','), filterToolResultNote.join(','), filterAssignee.join(','), createdFrom, createdTo]);

  const patchRow = (id: string, patch: Partial<OrderRow>) => {
    setItems((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  };

  const openPreview = (url: string, title: string, originalUrl?: string) =>
    setPreview({ url, originalUrl, title });

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

  const renderCtx: RenderCtx = { canEditField, patchRow, openPreview };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
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
              <label className="text-xs text-muted-foreground">Từ</label>
              <Input
                type="date"
                value={createdFrom}
                onChange={(e) => {
                  setCreatedFrom(e.target.value);
                  setPage(1);
                }}
                className="h-9 text-xs w-[140px]"
              />
              <label className="text-xs text-muted-foreground">đến</label>
              <Input
                type="date"
                value={createdTo}
                onChange={(e) => {
                  setCreatedTo(e.target.value);
                  setPage(1);
                }}
                className="h-9 text-xs w-[140px]"
              />
              {(createdFrom || createdTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreatedFrom('');
                    setCreatedTo('');
                    setPage(1);
                  }}
                  className="text-xs h-8"
                >
                  Clear
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
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

          <div className="flex items-center gap-3 flex-wrap text-xs">
            {has('order.field.printStatus.view') && (
              <FilterChips
                label="Trạng thái in"
                options={byCategory.print_status || []}
                value={filterPrintStatus}
                onChange={setFilterPrintStatus}
                renderType="color"
              />
            )}
            {has('order.field.toolResultNote.view') && (
              <FilterChips
                label="Note kq Tool"
                options={byCategory.tool_result_note || []}
                value={filterToolResultNote}
                onChange={setFilterToolResultNote}
                renderType="color"
              />
            )}
            {has('order.field.assignee.view') && (
              <FilterChips
                label="Người thực hiện"
                options={byCategory.assignee || []}
                value={filterAssignee}
                onChange={setFilterAssignee}
                renderType="text"
              />
            )}
          </div>
        </div>

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

                  return (
                    <React.Fragment key={t}>
                      <TableRow
                        className="bg-muted/40 hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleType(t)}
                      >
                        <TableCell colSpan={visibleCols.length + 2} className="py-1.5">
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
                                onChange={() => toggleRow(row._id)}
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

          {!loading && total > 0 && (
            <div className="border-t border-border p-3">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onChange={(p, ps) => {
                  setPage(p);
                  setPageSize(ps);
                }}
              />
            </div>
          )}
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

interface FilterChipsProps {
  label: string;
  options: Array<{ _id?: string; code: string; name: string; color?: string }>;
  value: string[];
  onChange: (codes: string[]) => void;
  renderType: 'color' | 'text';
}

function FilterChips({ label, options, value, onChange, renderType }: FilterChipsProps) {
  if (options.length === 0) return null;
  const set = new Set(value);
  const toggle = (code: string) => {
    const next = new Set(set);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(Array.from(next));
  };
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-muted-foreground">{label}:</span>
      {options.map((opt) => {
        const isOn = set.has(opt.code);
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => toggle(opt.code)}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px]',
              isOn
                ? 'border-transparent text-white'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
            style={isOn && renderType === 'color' && opt.color ? { backgroundColor: opt.color } : undefined}
          >
            {opt.name}
          </button>
        );
      })}
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[10px] text-muted-foreground underline ml-1"
        >
          Clear
        </button>
      )}
    </div>
  );
}
