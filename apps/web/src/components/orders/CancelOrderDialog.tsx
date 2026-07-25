import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

import { handleAxiosError } from '@/utils';

interface Props {
  order: WorkshopOrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nhận order đã cập nhật từ BE → caller patch local (không refetch). */
  onDone: (updated: WorkshopOrderRow) => void;
}

const MAX = 200;

export function CancelOrderDialog({ order, open, onOpenChange, onDone }: Props) {
  const { t } = useTranslation('orders');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!order || !reason.trim()) return;
    try {
      setLoading(true);
      const res = await RepositoryRemote.order.cancelOrder(order._id, { reason: reason.trim() });
      toast.success(t('dialogs.cancelOrder.success'));
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
          <DialogTitle>{t('dialogs.cancelOrder.title')}</DialogTitle>
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
            {t('dialogs.cancelOrder.reasonLabel')} <span className="text-rose-600">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX))}
            placeholder={t('dialogs.cancelOrder.reasonPlaceholder')}
            rows={3}
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground text-right">
            {reason.length}/{MAX}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common:actions.close')}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={loading || !reason.trim()}>
            {loading ? t('dialogs.cancelOrder.cancelling') : t('dialogs.cancelOrder.submitBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
