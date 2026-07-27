import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { History, MapPin, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { PATHS } from '@/constants/paths';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { AssignFactoryDialog } from '@/components/orders/AssignFactoryDialog';
import { OrderFilterBar } from '@/components/orders/OrderFilterBar';
import { OrderLogTimelineDialog } from '@/components/orders/OrderLogTimelineDialog';
import { OrderRowActionsMenu } from '@/components/orders/OrderRowActionsMenu';
import {
  buildColGroups,
  GroupCellContent,
  groupTitle,
  WORKSHOP_COLS,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { useDebounce } from '@/hooks/useDebounce';
import { NO_TOOL_ROW_CLASS, useIsNoTool } from '@/hooks/useIsNoTool';
import { usePermission } from '@/hooks/usePermission';
import { useSidebarResetSignal } from '@/hooks/useSidebarResetSignal';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Danh sách đơn CHƯA MAP XƯỞNG (factoryId null/missing) — menu tạm tách riêng
 * khỏi mọi view/API khác (Danh sách đơn, Dashboard, task Designer/Fulfillment
 * đều loại trừ đơn này mặc định, xem `order.service.ts:buildVisibilityFilter`).
 * Tái dùng `GET /orders?unmapped=true` (đã có sẵn) + `AssignFactoryDialog` để
 * gán xưởng ban đầu — không có route/entity mới.
 */
export default function UnmappedFactoryOrdersPage() {
  const { has, isAdmin } = usePermission();

  if (!isAdmin && !has('page.unmapped_factory')) {
    return <Navigate to={PATHS.ORDERS} replace />;
  }

  return <UnmappedFactoryOrdersContent />;
}

function UnmappedFactoryOrdersContent() {
  const { t } = useTranslation('orders');
  const { canViewField, canEditField, has, isAdmin, roleName } = usePermission();
  const canAssign = isAdmin || has('order.transfer');

  const loadWorkshopConfig = useWorkshopConfigStore((s) => s.load);
  const workshopConfigLoaded = useWorkshopConfigStore((s) => s.loaded);
  useEffect(() => {
    if (!workshopConfigLoaded) loadWorkshopConfig();
  }, [workshopConfigLoaded, loadWorkshopConfig]);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  // Facet "Sản phẩm": thống kê type + số đơn trong tập unmapped (faceted
  // aggregation `GET /orders/workshop-filters?unmapped=true`), chọn 1 type →
  // lọc bảng qua param `type` sẵn có của `getOrders`.
  const [fType, setFType] = useState('');
  const [typeOptions, setTypeOptions] = useState<Array<{ value: string; label: string; count?: number }>>([]);

  const [rows, setRows] = useState<WorkshopOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [preview, setPreview] = useState<{ url: string; originalUrl?: string; title: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; productionId: string } | null>(null);
  const [assignDialog, setAssignDialog] = useState<{ ids: string[]; single?: WorkshopOrderRow } | null>(null);

  // Click lại menu "Không xác định xưởng" ở sidebar khi đang đứng đúng trang
  // này → xóa hết filter (xem `useSidebarResetSignal`).
  useSidebarResetSignal(PATHS.ORDERS_UNMAPPED, () => {
    setSearch('');
    setFType('');
    setSelected(new Set());
    setPage(1);
  });

  const fetchRows = useCallback(async () => {
    const sp = new URLSearchParams();
    sp.set('unmapped', 'true');
    sp.set('page', String(page));
    sp.set('limit', String(pageSize));
    if (debouncedSearch.trim()) sp.set('search', debouncedSearch.trim());
    if (fType) sp.set('type', fType);
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
  }, [page, pageSize, debouncedSearch, fType]);

  const fetchTypeFacet = useCallback(async () => {
    const sp = new URLSearchParams();
    sp.set('unmapped', 'true');
    if (debouncedSearch.trim()) sp.set('search', debouncedSearch.trim());
    try {
      const res = await RepositoryRemote.order.getWorkshopFilters('?' + sp.toString());
      setTypeOptions((res.data?.data?.type || []) as Array<{ value: string; label: string; count?: number }>);
    } catch (err) {
      handleAxiosError(err);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    fetchTypeFacet();
  }, [fetchTypeFacet]);

  const visibleCols = useMemo(() => WORKSHOP_COLS.filter((c) => !c.perm || canViewField(c.key)), [canViewField]);
  const colGroups = useMemo(() => buildColGroups(visibleCols, roleName), [visibleCols, roleName]);

  const patchRow = (id: string, p: Partial<WorkshopOrderRow>) =>
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...p } : r)));
  const openPreview = (url: string, title: string, originalUrl?: string) => setPreview({ url, originalUrl, title });
  const ctx: WorkshopRenderCtx = { canEditField, patchRow, openPreview, t };
  const isNoTool = useIsNoTool();
  const emptyColSpan = colGroups.length + (canAssign ? 1 : 0) + 1;

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r._id))));

  const onAfterAssign = () => {
    setSelected(new Set());
    setAssignDialog(null);
    fetchRows();
    fetchTypeFacet();
  };

  const [autoAssigning, setAutoAssigning] = useState(false);
  // Re-map TOÀN BỘ đơn unmapped theo Product Config hiện tại (khớp type ↔
  // fullName, gán đủ bộ như lúc import) — dùng sau khi tạo config từ cột
  // "Chưa xác định xưởng" ở kanban Settings.
  const handleAutoAssign = async () => {
    try {
      setAutoAssigning(true);
      const res = await RepositoryRemote.order.remapUnmappedOrders();
      const data = res.data?.data as { scanned: number; matchedTypes: number; assigned: number } | undefined;
      if (data?.assigned) {
        toast.success(t('unmapped.autoAssignDone', { assigned: data.assigned, types: data.matchedTypes }));
      } else {
        toast.info(t('unmapped.autoAssignNone'));
      }
      setSelected(new Set());
      fetchRows();
      fetchTypeFacet();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setAutoAssigning(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <OrderFilterBar
          search={search}
          onSearchChange={setSearch}
          onReload={() => {
            fetchRows();
            fetchTypeFacet();
          }}
          loading={rowsLoading}
          facets={[
            {
              key: 'type',
              label: t('unmapped.productFacet'),
              value: fType,
              onChange: (v) => {
                setFType(v);
                setPage(1);
              },
              options: typeOptions,
            },
          ]}
          topActionsRight={
            <div className="ml-auto flex items-center gap-3">
              {canAssign && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-emerald-300 bg-emerald-50/40 hover:bg-emerald-100/60 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  onClick={handleAutoAssign}
                  disabled={autoAssigning || rowsLoading}
                >
                  <Wand2 size={13} className={cn(autoAssigning && 'animate-pulse')} /> {t('unmapped.autoAssign')}
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{total}</span>{' '}
                {t('unmapped.unmappedCount')}
              </span>
            </div>
          }
        />

        {canAssign && selected.size > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">
              {t('unmapped.selectedLabel')} <span className="tabular-nums font-bold">{selected.size}</span>{' '}
              {t('unmapped.ordersSuffix')}
            </span>
            <Button
              size="sm"
              onClick={() => setAssignDialog({ ids: Array.from(selected) })}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <MapPin size={13} /> {t('unmapped.assignFactory')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              {t('unmapped.deselect')}
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

        <div className="rounded-lg border border-border bg-card overflow-hidden relative">
          <div
            className={cn(
              'absolute top-0 left-0 right-0 h-0.5 overflow-hidden bg-primary/10 pointer-events-none transition-opacity duration-200 z-10',
              rowsLoading ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div className="h-full w-1/4 bg-primary animate-indeterminate-bar" />
          </div>

          <div
            className={cn(
              'overflow-x-auto transition-opacity duration-300',
              rowsLoading && rows.length > 0 && 'opacity-60',
            )}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  {canAssign && (
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selected.size === rows.length}
                        onChange={toggleAll}
                      />
                    </TableHead>
                  )}
                  {colGroups.map((g) => (
                    <TableHead key={g.key} className="whitespace-nowrap text-xs" style={{ minWidth: g.width }}>
                      {groupTitle(t, g.key, g.title)}
                    </TableHead>
                  ))}
                  <TableHead className="w-20 sticky right-0 z-20 bg-card"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={emptyColSpan} className="text-center py-8">
                      <Spinner size={18} className="text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                )}
                {!rowsLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={emptyColSpan} className="text-center py-8 text-sm text-muted-foreground">
                      {t('unmapped.emptyState')}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => {
                  const renderedByKey = new Map(visibleCols.map((c) => [c.key, c.render(row, ctx)]));
                  return (
                    <TableRow
                      key={row._id}
                      className={cn(
                        isNoTool(row.toolResult) && !selected.has(row._id) && NO_TOOL_ROW_CLASS,
                        selected.has(row._id) && 'bg-primary/5',
                      )}
                    >
                      {canAssign && (
                        <TableCell>
                          <input type="checkbox" checked={selected.has(row._id)} onChange={() => toggleRow(row._id)} />
                        </TableCell>
                      )}
                      {colGroups.map((g) => (
                        <TableCell key={g.key} className="py-2 align-top">
                          <GroupCellContent group={g} renderedByKey={renderedByKey} />
                        </TableCell>
                      ))}
                      <TableCell className="sticky right-0 z-10 bg-card shadow-[-1px_0_0_0_var(--border)]">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('tableWorkshop.history')}
                            onClick={() => setHistoryTarget({ id: row._id, productionId: row.productionId })}
                          >
                            <History size={13} className="text-muted-foreground" />
                          </Button>
                          {canAssign && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[11px] px-2 border-amber-300 bg-amber-50/40 hover:bg-amber-100/60 dark:border-amber-500/40 dark:bg-amber-500/10 dark:hover:bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              onClick={() => setAssignDialog({ ids: [row._id], single: row })}
                            >
                              <MapPin size={11} /> {t('unmapped.assignFactory')}
                            </Button>
                          )}
                          <OrderRowActionsMenu
                            order={row}
                            onChanged={() => {
                              fetchRows();
                            }}
                          />
                        </div>
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

        <AssignFactoryDialog
          open={!!assignDialog}
          onOpenChange={(o) => !o && setAssignDialog(null)}
          ids={assignDialog?.ids || []}
          single={assignDialog?.single}
          onSuccess={onAfterAssign}
        />
      </div>
    </TooltipProvider>
  );
}
