import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Ban } from 'lucide-react';
import type { CancelledOrderRow } from 'shared';

import { RepositoryRemote } from '@/services';

import { CopyButton } from '@/components/common/CopyButton';
import { Spinner } from '@/components/common/Spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { handleAxiosError } from '@/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Khoảng ngày (YYYY-MM-DD) đang lọc trên dashboard — khớp con số hiển thị. */
  from?: string;
  to?: string;
  /** Xưởng đang lọc (nếu có) để khớp scope con số. */
  factoryId?: string;
}

export function CancelledOrdersDialog({ open, onClose, from, to, factoryId }: Props) {
  const [rows, setRows] = useState<CancelledOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (factoryId) params.set('factoryId', factoryId);
        const qs = params.toString();
        const res = await RepositoryRemote.order.getCancelledOrders(qs ? `?${qs}` : '');
        setRows((res.data?.data || []) as CancelledOrderRow[]);
        setTotal((res.data?.total as number) || 0);
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, from, to, factoryId]);

  const fmt = (d?: Date) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban size={16} className="text-rose-600" />
            Đơn đã hủy
            {total > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                — {total} đơn{rows.length < total ? ` (hiện ${rows.length} mới nhất)` : ''}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={20} />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Không có đơn hủy trong khoảng đã chọn.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur text-[11px] text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Production ID</th>
                  <th className="text-left px-2 py-2 font-medium">Sản phẩm</th>
                  <th className="text-left px-2 py-2 font-medium">Size / Màu</th>
                  <th className="text-left px-2 py-2 font-medium">Công đoạn</th>
                  <th className="text-left px-2 py-2 font-medium">Lý do hủy</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Ngày hủy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((o) => (
                  <tr key={o._id} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{o.productionId}</span>
                        <CopyButton value={o.productionId} label="Production ID" iconSize={11} />
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[160px]">
                      <span className="line-clamp-2">{o.type || '—'}</span>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                      {o.size || '—'}
                      {o.color ? ` / ${o.color}` : ''}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {o.currentFulfillmentStage || o.designerStatus || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-rose-600 dark:text-rose-400 max-w-[200px]">
                      <span className="line-clamp-2">{o.cancelReason || '—'}</span>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{fmt(o.cancelledAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
