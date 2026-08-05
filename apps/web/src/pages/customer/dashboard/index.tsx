import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { CheckCircle2, ClipboardList, Factory, LayoutGrid, PackagePlus, XCircle } from 'lucide-react';
import type { CustomerDashboard } from 'shared';

import { CopyButton } from '@/components/common/CopyButton';
import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { PATHS } from '../../../constants/paths';
import { RepositoryRemote } from '../../../services';
import { handleAxiosError } from '../../../utils';

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  accentClass: string;
}

function StatCard({ label, value, icon, accentClass }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className={`rounded-lg p-2.5 ${accentClass}`}>{icon}</div>
      <div>
        <p className="text-2xl font-semibold leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function CustomerDashboardPage() {
  const { t } = useTranslation('customerPortal');
  const [data, setData] = useState<CustomerDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    RepositoryRemote.customerOrder
      .getDashboard()
      .then((res) => setData(res?.data?.data ?? null))
      .catch(handleAxiosError)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} />
      </div>
    );
  }

  const totals = data?.totals ?? { total: 0, processing: 0, completed: 0, cancelled: 0 };
  const recentOrders = data?.recentOrders ?? [];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{t('dashboard.title')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={PATHS.CUSTOMER_CATALOG}>
              <LayoutGrid size={14} className="mr-1.5" />
              {t('layout.nav.catalog')}
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to={PATHS.CUSTOMER_ORDER_NEW}>
              <PackagePlus size={14} className="mr-1.5" />
              {t('layout.newOrder')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label={t('dashboard.totalOrders')}
          value={totals.total}
          icon={<ClipboardList size={18} className="text-primary" />}
          accentClass="bg-primary/10"
        />
        <StatCard
          label={t('dashboard.processingOrders')}
          value={totals.processing}
          icon={<Factory size={18} className="text-amber-600" />}
          accentClass="bg-amber-500/10"
        />
        <StatCard
          label={t('dashboard.completedOrders')}
          value={totals.completed}
          icon={<CheckCircle2 size={18} className="text-emerald-600" />}
          accentClass="bg-emerald-500/10"
        />
        <StatCard
          label={t('dashboard.cancelledOrders')}
          value={totals.cancelled}
          icon={<XCircle size={18} className="text-red-600" />}
          accentClass="bg-red-500/10"
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('dashboard.recentOrders')}</h2>
        <Link to={PATHS.CUSTOMER_ORDERS} className="text-xs text-primary hover:underline">
          {t('dashboard.viewAllOrders')}
        </Link>
      </div>

      {recentOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {t('orders.empty')}{' '}
          <Link to={PATHS.CUSTOMER_ORDER_NEW} className="text-primary hover:underline">
            {t('orders.placeFirst')}
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('orders.columns.code')}</TableHead>
                <TableHead>{t('orders.columns.product')}</TableHead>
                <TableHead>{t('orders.columns.quantity')}</TableHead>
                <TableHead>{t('orders.columns.status')}</TableHead>
                <TableHead>{t('orders.orderedOn')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((order) => {
                const cancelled = !!order.cancelledAt;
                const stageLabel = cancelled
                  ? t('orders.statusCancelled')
                  : order.completed
                    ? t('orders.statusCompleted')
                    : order.currentStageLabel || t('orders.statusProcessing');
                return (
                  <TableRow key={order._id} className={cancelled ? 'opacity-60' : undefined}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        <Link
                          to={PATHS.CUSTOMER_ORDER_DETAIL.replace(':productionId', order.productionId)}
                          className="font-mono text-xs font-semibold text-primary hover:underline"
                        >
                          {order.productionId}
                        </Link>
                        <CopyButton value={order.productionId} label={t('orders.columns.code')} />
                      </span>
                    </TableCell>
                    <TableCell className="text-sm max-w-[240px] truncate">{order.type || '-'}</TableCell>
                    <TableCell className="text-sm">{order.quantity ?? '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={cancelled ? 'destructive' : order.completed ? 'success' : 'secondary'}
                        className="text-[10px]"
                      >
                        {stageLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {order.orderAt ? dayjs(order.orderAt).format('DD/MM/YYYY') : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default CustomerDashboardPage;
