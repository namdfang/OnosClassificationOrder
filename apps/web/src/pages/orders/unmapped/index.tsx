import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { History, MapPin } from 'lucide-react';

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
  const { canViewField, canEditField, has, isAdmin, roleName } = usePermission();
  const canAssign = isAdmin || has('order.transfer');

  const loadWorkshopConfig = useWorkshopConfigStore((s) => s.load);
  const workshopConfigLoaded = useWorkshopConfigStore((s) => s.loaded);
  useEffect(() => {
    if (!workshopConfigLoaded) loadWorkshopConfig();
  }, [workshopConfigLoaded, loadWorkshopConfig]);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const [rows, setRows] = useState<WorkshopOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [preview, setPreview] = useState<{ url: string; originalUrl?: string; title: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; productionId: string } | null>(null);
  const [assignDialog, setAssignDialog] = useState<{ ids: string[]; single?: WorkshopOrderRow } | null>(null);

  const fetchRows = useCallback(async () => {
    const sp = new URLSearchParams();
    sp.set('unmapped', 'true');
    sp.set('page', String(page));
    sp.set('limit', String(pageSize));
    if (debouncedSearch.trim()) sp.set('search', debouncedSearch.trim());
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
  }, [page, pageSize, debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const visibleCols = useMemo(() => WORKSHOP_COLS.filter((c) => !c.perm || canViewField(c.key)), [canViewField]);
  const colGroups = useMemo(() => buildColGroups(visibleCols, roleName), [visibleCols, roleName]);

  const patchRow = (id: string, p: Partial<WorkshopOrderRow>) =>
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...p } : r)));
  const openPreview = (url: string, title: string, originalUrl?: string) => setPreview({ url, originalUrl, title });
  const ctx: WorkshopRenderCtx = { canEditField, patchRow, openPreview };
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
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <OrderFilterBar
          search={search}
          onSearchChange={setSearch}
          onReload={fetchRows}
          loading={rowsLoading}
          topActionsRight={
            <span className="ml-auto text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{total}</span> đơn chưa xác định xưởng
            </span>
          }
        />

        {canAssign && selected.size > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">
              Đã chọn <span className="tabular-nums font-bold">{selected.size}</span> đơn
            </span>
            <Button
              size="sm"
              onClick={() => setAssignDialog({ ids: Array.from(selected) })}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <MapPin size={13} /> Gán xưởng
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
                      {g.title}
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
                      Không có đơn nào chưa xác định xưởng
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
                            title="Lịch sử"
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
                              <MapPin size={11} /> Gán xưởng
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
