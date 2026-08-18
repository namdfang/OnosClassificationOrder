import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { ShoppingBag } from 'lucide-react';
import type { CustomerAdminRow } from 'shared';

import { RepositoryRemote } from '@/services';

import { CopyButton } from '@/components/common/CopyButton';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { handleAxiosError } from '@/utils';
import { getStageLabel } from '@/utils/fulfillmentStageLabel';

interface OrderRow {
  _id: string;
  productionId: string;
  type?: string;
  factoryId?: string;
  inProductionAt?: string;
  currentFulfillmentStage?: string | null;
  fulfillmentCompletedAt?: string | null;
  cancelledAt?: string | null;
}

interface FactoryLite {
  _id: string;
  name: string;
  shortName?: string;
}

interface CustomerOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CustomerAdminRow | null;
  factories: FactoryLite[];
}

/** Drill-down "Đơn hàng của khách" — lọc exact-pair (userSku, userEmail) qua GET /orders. */
export default function CustomerOrdersDialog({ open, onOpenChange, item, factories }: CustomerOrdersDialogProps) {
  const { t } = useTranslation('customers');
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const factoryById = useMemo(() => new Map(factories.map((f) => [String(f._id), f])), [factories]);

  useEffect(() => {
    if (!open) setPage(1);
  }, [open]);

  useEffect(() => {
    if (!open || !item) return;
    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
        params.set('userSku', item.userSku);
        if (item.userEmail) params.set('userEmail', item.userEmail);
        const res = await RepositoryRemote.order.getOrders(`?${params.toString()}`);
        setRows((res.data?.data || []) as OrderRow[]);
        setTotal((res.data?.total as number) || 0);
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, item, page, pageSize]);

  const stageCell = (o: OrderRow) => {
    if (o.cancelledAt) return <Badge variant="outline">{t('ordersDialog.stageCancelled')}</Badge>;
    if (o.fulfillmentCompletedAt) return <Badge variant="secondary">{t('ordersDialog.stageCompleted')}</Badge>;
    if (o.currentFulfillmentStage)
      return <Badge variant="outline">{getStageLabel(t, o.currentFulfillmentStage)}</Badge>;
    return <span className="text-xs text-muted-foreground">{t('ordersDialog.stageNotStarted')}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag size={16} className="text-indigo-500" />
            {t('ordersDialog.title', { sku: item?.userSku ?? '' })}
            {total > 0 && <span className="text-xs font-normal text-muted-foreground">({total})</span>}
          </DialogTitle>
        </DialogHeader>

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={20} />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">{t('ordersDialog.empty')}</p>
        ) : (
          <>
            <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur text-[11px] text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">{t('ordersDialog.colProductionId')}</th>
                    <th className="text-left px-2 py-2 font-medium">{t('ordersDialog.colProduct')}</th>
                    <th className="text-left px-2 py-2 font-medium">{t('ordersDialog.colFactory')}</th>
                    <th className="text-left px-2 py-2 font-medium whitespace-nowrap">
                      {t('ordersDialog.colInProduction')}
                    </th>
                    <th className="text-left px-2 py-2 font-medium">{t('ordersDialog.colStage')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rows.map((o) => {
                    const factory = o.factoryId ? factoryById.get(String(o.factoryId)) : undefined;
                    return (
                      <tr key={o._id} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1">
                            <span className="font-mono">{o.productionId}</span>
                            <CopyButton value={o.productionId} />
                          </div>
                        </td>
                        <td className="px-2 py-1.5">{o.type || '—'}</td>
                        <td className="px-2 py-1.5">{factory?.shortName || factory?.name || '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                          {o.inProductionAt ? dayjs(o.inProductionAt).format('DD/MM/YYYY HH:mm') : '—'}
                        </td>
                        <td className="px-2 py-1.5">{stageCell(o)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              position="bottom"
              page={page}
              pageSize={pageSize}
              total={total}
              loading={loading}
              onChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
