'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import type { CustomerPushQuoteOrder } from 'shared';
import { Button } from '@/components/shared/button';
import { useToast } from '@/components/shared/toast';
import { apiFetch } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';
import { fmtUSD } from '@/lib/utils';

interface PushDialogProps {
  ids: string[];
  open: boolean;
  onClose: () => void;
  onPushed: () => void;
}

/** Mirror `apps/web/src/components/customer/PushToProductionDialog.tsx`: preview giá → xác nhận → push. */
export function PushDialog({ ids, open, onClose, onPushed }: PushDialogProps) {
  const { t } = useTranslation('customerPortal');
  const { toast } = useToast();
  const [pushing, setPushing] = useState(false);
  const { data: preview, isLoading: loading } = useSWR(
    open && ids.length > 0 ? ['push-preview', ...ids] : null,
    () =>
      apiFetch<ApiRes<{ orders: CustomerPushQuoteOrder[]; totalAmount: number }>>('/api/v1/customer/orders/push-preview', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    { revalidateOnFocus: false, onError: (e: Error) => toast('error', e.message) },
  );
  const orders = preview?.data.orders ?? [];
  const totalAmount = preview?.data.totalAmount ?? 0;

  if (!open) return null;
  const pushableCount = orders.filter((o) => !o.error).length;
  const hasQuoteWarning = orders.some((o) => !o.error && o.items.some((i) => i.error));

  const handlePush = async () => {
    setPushing(true);
    try {
      const res = await apiFetch<ApiRes<{ results: { status: string }[] }>>('/api/v1/customer/orders/push', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      const results = res.data.results ?? [];
      const pushed = results.filter((r) => r.status === 'pushed').length;
      const failed = results.length - pushed;
      if (pushed > 0) toast('success', t('push.successToast', { pushed }));
      if (failed > 0) toast('error', t('push.failedToast', { failed }));
      onClose();
      if (pushed > 0) onPushed();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'var(--color-overlay)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-card rounded-xl border border-border1 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border1">
          <h2 className="text-sm font-bold text-text-primary">{t('push.title', { count: ids.length })}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-card-hover text-text-muted">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-thin">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.stagingId} className="rounded-lg border border-border1 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-surface-muted">
                  <p className="text-xs font-semibold truncate">{order.orderId || order.orderName || `#${order.stagingId.slice(-6)}`}</p>
                  {order.error ? (
                    <span className="text-[10px] font-semibold text-error">{order.error}</span>
                  ) : (
                    <span className="text-xs font-semibold tabular-nums">{fmtUSD(order.orderTotal)}</span>
                  )}
                </div>
                {!order.error && (
                  <table className="w-full text-xs">
                    <tbody>
                      {order.items.map((item, i) => (
                        <tr key={i} className="border-t border-border2">
                          <td className="px-3 py-1.5">
                            <p className="truncate max-w-[220px]">{item.type || item.sku || '—'}</p>
                            <p className="text-[10px] text-text-muted font-mono">{[item.sku, item.size].filter(Boolean).join(' · ')}</p>
                          </td>
                          <td className="px-2 py-1.5 text-text-muted whitespace-nowrap">×{item.quantity}</td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                            {item.error ? (
                              <span className="inline-flex items-center gap-1 text-warning">
                                <AlertTriangle size={11} />
                                {item.error}
                              </span>
                            ) : item.priceSnapshot ? (
                              <>
                                {item.priceSnapshot.discountedPrice != null ? (
                                  <>
                                    <span className="line-through text-text-muted mr-1">{fmtUSD(item.priceSnapshot.unitPrice)}</span>
                                    <span className="font-medium">{fmtUSD(item.priceSnapshot.discountedPrice)}</span>
                                  </>
                                ) : (
                                  <span className="font-medium">{fmtUSD(item.priceSnapshot.unitPrice)}</span>
                                )}
                                <span className="text-text-muted"> = {fmtUSD(item.priceSnapshot.lineTotal)}</span>
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
            ))
          )}
          {hasQuoteWarning && (
            <p className="flex items-center gap-1.5 text-[11px] text-warning">
              <AlertTriangle size={12} />
              {t('push.quoteWarning')}
            </p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border1 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-text-muted">{t('push.priceNote')}</p>
            <p className="text-sm font-bold tabular-nums">
              {t('push.total')}: {fmtUSD(totalAmount)}
            </p>
          </div>
          <Button variant="primary" onClick={handlePush} loading={pushing} disabled={loading || pushableCount === 0}>
            {t('push.confirm', { count: pushableCount })}
          </Button>
        </div>
      </div>
    </div>
  );
}
