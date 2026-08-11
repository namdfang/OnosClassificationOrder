import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Factory } from 'lucide-react';
import type { CustomerPushQuoteOrder } from 'shared';
import { toast } from 'sonner';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { RepositoryRemote } from '../../services';
import { handleAxiosError } from '../../utils';

/** Format tiền USD — giá catalog/chốt đơn khách đều là USD. */
export function formatUsd(n?: number): string {
  if (n == null) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PushToProductionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** _id các staging order PENDING được tick. */
  ids: string[];
  /** Gọi sau khi push xong (thành công ≥1 đơn) để reload listing. */
  onPushed: () => void;
}

/**
 * Dialog xác nhận "Push to production" — hiện bảng GIÁ CHỐT từng item (server
 * tính qua `push-preview`, đóng băng lúc push) + tổng tiền, rồi mới commit.
 * Gate OFF: push luôn; ledger vẫn ghi `waived` phía BE (plan §12.1).
 */
export function PushToProductionDialog({ open, onOpenChange, ids, onPushed }: PushToProductionDialogProps) {
  const { t } = useTranslation('customerPortal');
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [orders, setOrders] = useState<CustomerPushQuoteOrder[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    if (!open || ids.length === 0) return;
    setLoading(true);
    RepositoryRemote.customerOrder
      .previewPush({ ids })
      .then((res) => {
        setOrders(res?.data?.data?.orders ?? []);
        setTotalAmount(res?.data?.data?.totalAmount ?? 0);
      })
      .catch(handleAxiosError)
      .finally(() => setLoading(false));
  }, [open, ids]);

  const pushableCount = orders.filter((o) => !o.error).length;
  const hasQuoteWarning = orders.some((o) => !o.error && o.items.some((i) => i.error));

  const handlePush = async () => {
    try {
      setPushing(true);
      const res = await RepositoryRemote.customerOrder.pushToProduction({ ids });
      const results = res?.data?.data?.results ?? [];
      const pushed = results.filter((r: { status: string }) => r.status === 'pushed').length;
      const failed = results.length - pushed;
      if (pushed > 0) toast.success(t('push.successToast', { pushed }));
      if (failed > 0) toast.error(t('push.failedToast', { failed }));
      onOpenChange(false);
      if (pushed > 0) onPushed();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setPushing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Factory size={16} />
            {t('push.title', { count: ids.length })}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={22} />
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
            {orders.map((order) => (
              <div key={order.stagingId} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5">
                  <p className="text-xs font-semibold truncate">
                    {order.orderId || order.orderName || `#${order.stagingId.slice(-6)}`}
                  </p>
                  {order.error ? (
                    <Badge variant="destructive" className="text-[10px]">
                      {order.error}
                    </Badge>
                  ) : (
                    <span className="text-xs font-semibold">{formatUsd(order.orderTotal)}</span>
                  )}
                </div>
                {!order.error && (
                  <table className="w-full text-xs">
                    <tbody>
                      {order.items.map((item, i) => (
                        <tr key={i} className="border-t border-border/60">
                          <td className="px-3 py-1.5">
                            <p className="truncate max-w-[220px]">{item.type || item.sku || '—'}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {[item.sku, item.size].filter(Boolean).join(' · ')}
                            </p>
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">×{item.quantity}</td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            {item.error ? (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <AlertTriangle size={11} />
                                {item.error}
                              </span>
                            ) : item.priceSnapshot ? (
                              <>
                                {item.priceSnapshot.discountedPrice != null ? (
                                  <>
                                    <span className="line-through text-muted-foreground mr-1">
                                      {formatUsd(item.priceSnapshot.unitPrice)}
                                    </span>
                                    <span className="font-medium">{formatUsd(item.priceSnapshot.discountedPrice)}</span>
                                  </>
                                ) : (
                                  <span className="font-medium">{formatUsd(item.priceSnapshot.unitPrice)}</span>
                                )}
                                <span className="text-muted-foreground"> = {formatUsd(item.priceSnapshot.lineTotal)}</span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}

            {hasQuoteWarning && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle size={12} />
                {t('push.quoteWarning')}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">{t('push.priceNote')}</p>
          <p className="text-sm font-semibold">
            {t('push.total')}: {formatUsd(totalAmount)}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pushing}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button onClick={handlePush} disabled={loading || pushing || pushableCount === 0}>
            {pushing ? <Spinner size={14} className="mr-1.5" /> : <Factory size={14} className="mr-1.5" />}
            {t('push.confirm', { count: pushableCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
