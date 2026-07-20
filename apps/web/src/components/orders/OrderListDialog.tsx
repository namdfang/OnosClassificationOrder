import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, ListChecks } from 'lucide-react';

import { RepositoryRemote } from '@/services';

import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { CancelledBadge } from '@/components/orders/CancelledBadge';
import { OrderLogTimelineDialog } from '@/components/orders/OrderLogTimelineDialog';
import {
  buildColGroups,
  GroupCellContent,
  WORKSHOP_COLS,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';
import { isCancelled } from '@/utils/orderActions';

import { NO_TOOL_ROW_CLASS, useIsNoTool } from '@/hooks/useIsNoTool';
import { usePermission } from '@/hooks/usePermission';

const PAGE_SIZE = 20;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Tiêu đề dialog — mô tả con số vừa bấm (vd. "Tổng lỗi · 12/07"). */
  title: React.ReactNode;
  /**
   * Query string (KHÔNG có dấu `?`, KHÔNG kèm page/limit) select đúng tập đơn
   * khớp con số qua `getOrders`. `null` khi dialog đóng — dùng để reset trang.
   */
  query?: string | null;
  /**
   * Danh sách `_id` đơn — nếu truyền, fetch qua `getOrders/by-ids` (KHÔNG scoping
   * role, phù hợp đơn chưa gán). Ưu tiên hơn `query` khi cùng có.
   */
  ids?: string[] | null;
}

/**
 * Drill-down đơn hàng dạng modal — bấm 1 con số trên dashboard mở ra danh sách
 * đơn khớp filter, phân trang, layout bảng giống `OrderFactoryTab` (Xưởng +
 * nhóm cột nghiệp vụ). Read-only: cho sửa inline field (patchRow chỉ đổi state
 * cục bộ) + xem lịch sử + preview ảnh, không bulk/chuyển xưởng.
 */
export function OrderListDialog({ open, onClose, title, query, ids }: Props) {
  const idsKey = ids && ids.length ? ids.join(',') : null;
  const { canViewField, canEditField, roleName } = usePermission();
  const [rows, setRows] = useState<WorkshopOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const [preview, setPreview] = useState<{ url: string; originalUrl?: string; title: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; productionId: string } | null>(null);

  // Đổi nguồn (bấm con số / nhóm khác) → về trang 1.
  useEffect(() => {
    setPage(1);
  }, [query, idsKey]);

  const fetchRows = useCallback(async () => {
    if (!open || (query == null && idsKey == null)) return;
    const sp = new URLSearchParams(idsKey != null ? '' : query ?? '');
    if (idsKey != null) sp.set('ids', idsKey);
    sp.set('page', String(page));
    sp.set('limit', String(PAGE_SIZE));
    try {
      setLoading(true);
      const res =
        idsKey != null
          ? await RepositoryRemote.order.getOrdersByIds('?' + sp.toString())
          : // Drill-down số ở dashboard → list KHÔNG scoping role (mọi role thấy
            // cùng tập đơn khớp con số; cột vẫn lọc theo quyền qua canViewField).
            await RepositoryRemote.order.getOverviewList('?' + sp.toString());
      setRows((res.data?.data || []) as WorkshopOrderRow[]);
      setTotal(res.data?.total || 0);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  }, [open, query, idsKey, page]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const visibleCols = useMemo(() => WORKSHOP_COLS.filter((c) => !c.perm || canViewField(c.key)), [canViewField]);
  const colGroups = useMemo(() => buildColGroups(visibleCols, roleName), [visibleCols, roleName]);

  const patchRow = (id: string, p: Partial<WorkshopOrderRow>) =>
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...p } : r)));
  const openPreview = (url: string, t: string, originalUrl?: string) => setPreview({ url, originalUrl, title: t });
  const ctx: WorkshopRenderCtx = { canEditField, patchRow, openPreview };
  const isNoTool = useIsNoTool();

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-none w-[95vw] h-screen p-0 gap-0 flex flex-col sm:rounded-none">
          <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <ListChecks size={16} className="text-indigo-600" />
              {title}
              <span className="text-xs font-normal text-muted-foreground">— {total} đơn</span>
              {loading && <Spinner size={12} className="text-muted-foreground" />}
            </DialogTitle>
          </DialogHeader>

          <TooltipProvider delayDuration={200}>
            <div className="flex-1 min-h-0 flex flex-col">
              <PaginationBar
                position="top"
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                loading={loading && rows.length === 0}
                onChange={(p) => setPage(p)}
              />
              <div className={cn('flex-1 min-h-0 overflow-auto', loading && rows.length > 0 && 'opacity-60')}>
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-card">
                    <TableRow>
                      <TableHead className="min-w-[150px]">Xưởng (đang / gốc)</TableHead>
                      {colGroups.map((g) => (
                        <TableHead key={g.key} className="whitespace-nowrap text-xs" style={{ minWidth: g.width }}>
                          {g.title}
                        </TableHead>
                      ))}
                      <TableHead className="w-12 sticky right-0 z-20 bg-card"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={colGroups.length + 2} className="text-center py-10">
                          <Spinner size={18} className="text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && rows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={colGroups.length + 2}
                          className="text-center py-10 text-sm text-muted-foreground"
                        >
                          Không có đơn nào phù hợp
                        </TableCell>
                      </TableRow>
                    )}
                    {rows.map((row) => {
                      const isTransferred =
                        !!row.originalFactoryId && !!row.factoryId && row.originalFactoryId !== row.factoryId;
                      const renderedByKey = new Map(visibleCols.map((c) => [c.key, c.render(row, ctx)]));
                      return (
                        <TableRow
                          key={row._id}
                          className={cn(
                            isNoTool(row.toolResult) && NO_TOOL_ROW_CLASS,
                            isCancelled(row) && 'opacity-60',
                          )}
                        >
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
                            </div>
                          </TableCell>
                          {colGroups.map((g, gi) => (
                            <TableCell key={g.key} className="py-2 align-top">
                              {gi === 0 && isCancelled(row) && (
                                <div className="mb-1">
                                  <CancelledBadge reason={row.cancelReason} />
                                </div>
                              )}
                              <GroupCellContent group={g} renderedByKey={renderedByKey} />
                            </TableCell>
                          ))}
                          <TableCell className="sticky right-0 z-10 bg-card shadow-[-1px_0_0_0_var(--border)]">
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
                  </TableBody>
                </Table>
              </div>
              <PaginationBar
                position="bottom"
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                loading={loading && rows.length === 0}
                onChange={(p) => setPage(p)}
              />
            </div>
          </TooltipProvider>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
