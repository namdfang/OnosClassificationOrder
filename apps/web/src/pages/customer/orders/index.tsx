import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { PackageSearch } from 'lucide-react';
import type { CustomerOrderSummary } from 'shared';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { PATHS } from '../../../constants/paths';
import { RepositoryRemote } from '../../../services';
import { handleAxiosError } from '../../../utils';

function CustomerOrders() {
  const { t } = useTranslation('customerPortal');
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    RepositoryRemote.customerOrder
      .listOrders()
      .then((res) => setOrders(res?.data?.data ?? []))
      .catch(handleAxiosError)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold">{t('orders.title')}</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <PackageSearch size={32} className="mb-3" />
          <p className="text-sm">{t('orders.empty')}</p>
          <Link to={PATHS.CUSTOMER_ORDER_NEW} className="text-primary text-sm hover:underline mt-2">
            {t('orders.placeFirst')}
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('orders.columns.code')}</TableHead>
                <TableHead>{t('orders.columns.product')}</TableHead>
                <TableHead>{t('orders.columns.colorSize')}</TableHead>
                <TableHead>{t('orders.columns.quantity')}</TableHead>
                <TableHead>{t('orders.columns.status')}</TableHead>
                <TableHead>{t('orders.columns.orderDate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order._id}>
                  <TableCell>
                    <Link
                      to={PATHS.CUSTOMER_ORDER_DETAIL.replace(':productionId', order.productionId)}
                      className="text-primary hover:underline font-medium"
                    >
                      {order.productionId}
                    </Link>
                  </TableCell>
                  <TableCell>{order.type || '-'}</TableCell>
                  <TableCell>
                    {order.color || '-'} / {order.size || '-'}
                  </TableCell>
                  <TableCell>{order.quantity ?? '-'}</TableCell>
                  <TableCell>
                    {order.cancelledAt ? (
                      <Badge variant="destructive">{t('orders.statusCancelled')}</Badge>
                    ) : (
                      <Badge variant="secondary">{order.status || t('orders.statusProcessing')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{order.orderAt ? dayjs(order.orderAt).format('DD/MM/YYYY') : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default CustomerOrders;
