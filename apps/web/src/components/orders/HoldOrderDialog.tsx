import React, { useState } from 'react';
import { HOLD_REASON_WAITING_ADDRESS, HOLD_REASON_WAITING_DESIGN } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import type { WorkshopOrderRow } from '@/components/orders/workshopTableConfig';
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

import { cn, handleAxiosError } from '@/utils';

interface Props {
  order: WorkshopOrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nhận order đã cập nhật từ BE → caller patch local (không refetch). */
  onDone: (updated: WorkshopOrderRow) => void;
}

const MAX = 200;

/**
 * Lý do giữ đơn phổ biến — click để điền nhanh, vẫn sửa tay được sau khi chọn.
 * Dùng chung với bulk hold ở `BulkEditToolbar.tsx`. 2 preset đầu dùng CHÍNH XÁC
 * text từ `shared` (`HOLD_REASON_WAITING_DESIGN`/`_ADDRESS`) — cron tự động
 * lấy ngược design/địa chỉ từ OnosPod match theo đúng text này, đổi ở FE mà
 * không đổi hằng số dùng chung sẽ làm cron không nhận diện được đơn nữa.
 */
export const HOLD_REASON_PRESETS = [
  HOLD_REASON_WAITING_DESIGN,
  HOLD_REASON_WAITING_ADDRESS,
  'Đợi khách sửa thông tin đơn',
  'Chờ khách xác nhận',
  'Thiếu vật tư',
];

/**
 * Dialog GIỮ 1 đơn — lý do KHÔNG bắt buộc (khác CancelOrderDialog). Sau khi giữ,
 * đơn bị khóa mọi thao tác + tô xám cho tới khi mở lại.
 */
export function HoldOrderDialog({ order, open, onOpenChange, onDone }: Props) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!order) return;
    try {
      setLoading(true);
      const res = await RepositoryRemote.order.holdOrder(order._id, { reason: reason.trim() || undefined });
      toast.success('Đã giữ đơn');
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
          <DialogTitle>Giữ đơn</DialogTitle>
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
          <label className="text-xs font-medium text-foreground">Lý do giữ (không bắt buộc)</label>
          <div className="flex flex-wrap gap-1.5">
            {HOLD_REASON_PRESETS.map((preset) => {
              const active = reason === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(active ? '' : preset)}
                  className={cn(
                    'px-2.5 py-1 rounded-full border text-xs transition-colors',
                    active
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                  )}
                >
                  {preset}
                </button>
              );
            })}
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX))}
            placeholder="VD: chờ khách xác nhận, thiếu vật tư…"
            rows={3}
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground text-right">
            {reason.length}/{MAX}
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Đơn giữ sẽ bị khóa mọi thao tác cho tới khi bạn mở lại.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Đóng
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? 'Đang giữ…' : 'Giữ đơn'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
