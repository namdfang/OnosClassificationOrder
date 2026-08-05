import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { ImageIcon, PackageSearch, Search, X } from 'lucide-react';
import type { CustomerOrderSummary } from 'shared';

import { CopyButton } from '@/components/common/CopyButton';
import { LoadingOverlay } from '@/components/common/LoadingOverlay';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { PATHS } from '../../../constants/paths';
import { RepositoryRemote } from '../../../services';
import { handleAxiosError } from '../../../utils';

const PAGE_SIZE = 20;

function OrderTableRow({ order }: { order: CustomerOrderSummary }) {
  const { t } = useTranslation('customerPortal');
  const cancelled = !!order.cancelledAt;
  const stageLabel = cancelled
    ? t('orders.statusCancelled')
    : order.completed
      ? t('orders.statusCompleted')
      : order.currentStageLabel || t('orders.statusProcessing');
  const badgeVariant = cancelled ? 'destructive' : order.completed ? 'success' : 'secondary';

  return (
    <TableRow className={cancelled ? 'opacity-60' : undefined}>
      <TableCell>
        {order.mockupUrl ? (
          <img
            src={order.mockupUrl}
            alt={order.type || order.productionId}
            className="w-11 h-11 rounded-md object-cover border border-border bg-muted"
          />
        ) : (
          <div className="w-11 h-11 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground">
            <ImageIcon size={14} />
          </div>
        )}
      </TableCell>
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
      <TableCell>
        <p className="text-sm text-foreground truncate max-w-[220px]">{order.type || '-'}</p>
        <p className="text-xs text-muted-foreground">{[order.color, order.size].filter(Boolean).join(' / ') || '-'}</p>
      </TableCell>
      <TableCell className="text-sm">{order.quantity ?? '-'}</TableCell>
      <TableCell>
        <Badge variant={badgeVariant} className="text-[10px]">
          {stageLabel}
        </Badge>
        {order.currentStageAt && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{dayjs(order.currentStageAt).format('DD/MM/YYYY')}</p>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {order.orderAt ? dayjs(order.orderAt).format('DD/MM/YYYY') : '-'}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {order.inProductionAt ? dayjs(order.inProductionAt).format('DD/MM/YYYY') : '-'}
      </TableCell>
      <TableCell>
        <Link
          to={PATHS.CUSTOMER_ORDER_DETAIL.replace(':productionId', order.productionId)}
          className="text-xs text-primary hover:underline whitespace-nowrap"
        >
          {t('orders.viewDetail')}
        </Link>
      </TableCell>
    </TableRow>
  );
}

function CustomerOrders() {
  const { t } = useTranslation('customerPortal');
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [productType, setProductType] = useState('');
  const [productTypes, setProductTypes] = useState<string[]>([]);

  useEffect(() => {
    RepositoryRemote.customerOrder
      .listProductTypes()
      .then((res) => setProductTypes(res?.data?.data ?? []))
      .catch(() => {
        /* filter sản phẩm không load được thì vẫn dùng được listing */
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    RepositoryRemote.customerOrder
      .listOrders(page, pageSize, { search, type: productType })
      .then((res) => {
        setOrders(res?.data?.data ?? []);
        setTotal(res?.data?.total ?? 0);
      })
      .catch(handleAxiosError)
      .finally(() => setLoading(false));
  }, [page, pageSize, search, productType]);

  const applySearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setProductType('');
    setPage(1);
  };

  const hasFilter = !!search || !!productType;
  const emptyBecauseFilter = orders.length === 0 && hasFilter;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold">{t('orders.title')}</h1>
        {!loading && total > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">{t('orders.resultsCount', { count: total })}</p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            onBlur={applySearch}
            placeholder={t('orders.searchPlaceholder')}
            className="h-9 w-56 pl-8 text-sm"
          />
        </div>

        <select
          value={productType}
          onChange={(e) => {
            setPage(1);
            setProductType(e.target.value);
          }}
          className="h-9 max-w-[260px] rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label={t('orders.filterProduct')}
        >
          <option value="">{t('orders.allProducts')}</option>
          {productTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        {hasFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={12} />
            {t('orders.clearFilters')}
          </button>
        )}
      </div>

      {loading && orders.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <PackageSearch size={32} className="mb-3" />
          <p className="text-sm">{emptyBecauseFilter ? t('orders.emptyFiltered') : t('orders.empty')}</p>
          {emptyBecauseFilter ? (
            <button type="button" onClick={clearFilters} className="text-primary text-sm hover:underline mt-2">
              {t('orders.clearFilters')}
            </button>
          ) : (
            <Link to={PATHS.CUSTOMER_ORDER_NEW} className="text-primary text-sm hover:underline mt-2">
              {t('orders.placeFirst')}
            </Link>
          )}
        </div>
      ) : (
        <>
          <LoadingOverlay active={loading} className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14"></TableHead>
                  <TableHead>{t('orders.columns.code')}</TableHead>
                  <TableHead>{t('orders.columns.product')}</TableHead>
                  <TableHead>{t('orders.columns.quantity')}</TableHead>
                  <TableHead>{t('orders.columns.status')}</TableHead>
                  <TableHead>{t('orders.orderedOn')}</TableHead>
                  <TableHead>{t('orders.inProductionOn')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <OrderTableRow key={order._id} order={order} />
                ))}
              </TableBody>
            </Table>
          </LoadingOverlay>

          <div className="mt-4">
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
          </div>
        </>
      )}
    </div>
  );
}

export default CustomerOrders;
