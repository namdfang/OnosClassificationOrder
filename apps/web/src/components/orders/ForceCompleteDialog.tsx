import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
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

import { handleAxiosError } from '@/utils';
import { formatDate } from '@/utils/date';

interface Props {
  order: WorkshopOrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nhận order đã cập nhật từ BE → caller patch local (không refetch). */
  onDone: (updated: WorkshopOrderRow) => void;
}

/**
 * Xác nhận "Chuyển hoàn thành" (Orders.md §23) — SuperAdmin ép 1 đơn về đã
 * hoàn thành sản xuất.
 *
 * Dialog CỐ Ý không tự tính trước xem khâu nào sẽ được điền mốc: luật đó nằm ở
 * `planForceComplete` phía máy chủ, chép lại ở đây là dựng thêm một bản sao sẽ
 * trôi khỏi bản gốc. Người bấm chỉ cần biết đúng hai điều — khoảng thời gian
 * được chia đều, và rằng thao tác này không hoàn tác được.
 */
export function ForceCompleteDialog({ order, open, onOpenChange, onDone }: Props) {
  const { t } = useTranslation('orders');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!order) return;
    try {
      setLoading(true);
      const res = await RepositoryRemote.order.forceCompleteOrder(order._id);
      toast.success(t('dialogs.forceComplete.success'));
      onOpenChange(false);
      onDone((res.data?.data as WorkshopOrderRow) ?? order);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialogs.forceComplete.title')}</DialogTitle>
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

        <p className="text-sm text-muted-foreground">{t('dialogs.forceComplete.desc')}</p>

        <div className="rounded-md border border-border px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('dialogs.forceComplete.windowLabel')}
          </p>
          {order?.inProductionAt ? (
            <p className="mt-0.5 text-sm text-foreground">
              {formatDate(order.inProductionAt)} → {t('dialogs.forceComplete.windowNow')}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-amber-600">{t('dialogs.forceComplete.noStart')}</p>
          )}
        </div>

        <p className="flex gap-2 text-xs text-amber-600">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          {t('dialogs.forceComplete.warning')}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common:actions.close')}
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? t('dialogs.forceComplete.submitting') : t('dialogs.forceComplete.submitBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
