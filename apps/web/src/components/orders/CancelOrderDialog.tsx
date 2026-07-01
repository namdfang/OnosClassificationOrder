import React, { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import type { WorkshopOrderRow } from '@/components/orders/workshopTableConfig';

interface Props {
  order: WorkshopOrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nhận order đã cập nhật từ BE → caller patch local (không refetch). */
  onDone: (updated: WorkshopOrderRow) => void;
}

const MAX = 200;

export function CancelOrderDialog({ order, open, onOpenChange, onDone }: Props) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!order || !reason.trim()) return;
    try {
      setLoading(true);
      const res = await RepositoryRemote.order.cancelOrder(order._id, { reason: reason.trim() });
      toast.success('Đã hủy đơn');
      setReason('');
      onOpenChange(false);
      onDone((res.data?.data as WorkshopOrderRow) ?? order);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : (setReason(''), onOpenChange(false)))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hủy đơn</DialogTitle>
          <DialogDescription>
            {order ? (
              <span className="text-xs">
                <span className="font-mono font-semibold text-foreground">{order.productionId}</span>
                {order.type ? ` · ${order.type}` : ''}
                {order.size ? ` · ${order.size}` : ''}
                {order.color ? ` · ${order.color}` : ''}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            Lý do hủy <span className="text-rose-600">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX))}
            placeholder="Nhập lý do hủy đơn…"
            rows={3}
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground text-right">
            {reason.length}/{MAX}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Đóng
          </Button>
          <Button variant="destructive" onClick={submit} disabled={loading || !reason.trim()}>
            {loading ? 'Đang hủy…' : 'Hủy đơn'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
