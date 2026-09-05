import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Eye, Factory, FileUp, ImageIcon, PackagePlus, PackageSearch, PauseCircle, Search, X } from 'lucide-react';
import type { CustomerOrderCounts, CustomerStagingOrder } from 'shared';
import { CustomerOrderStatus } from 'shared';
import { toast } from 'sonner';

import { PATHS } from '@/constants/paths';

import { useConfirm } from '@/components/common/ConfirmDialog';
import { CopyButton } from '@/components/common/CopyButton';
import { LoadingOverlay } from '@/components/common/LoadingOverlay';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import {
  CustomerOrderOverlayBadges,
  CustomerOrderPaymentBadge,
  CustomerOrderStatusBadge,
} from '@/components/customer/CustomerOrderBadges';
import { CustomerOrderDetailDrawer, orderDisplayCode } from '@/components/customer/CustomerOrderDetailDrawer';
import { formatUsd, PushToProductionDialog } from '@/components/customer/PushToProductionDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { RepositoryRemote } from '../../../services';
import { handleAxiosError } from '../../../utils';

const PAGE_SIZE = 20;

/** Tab bar 8 trạng thái — mirror hệ OnosPod cũ (plan §1). `all` = bỏ filter. */
const STATUS_TABS: Array<{ value: CustomerOrderStatus | 'all'; countKey: keyof CustomerOrderCounts }> = [
  { value: 'all', countKey: 'all' },
  { value: CustomerOrderStatus.Pending, countKey: 'pending' },
  { value: CustomerOrderStatus.Processing, countKey: 'processing' },
  { value: CustomerOrderStatus.InProduction, countKey: 'inProduction' },
  { value: CustomerOrderStatus.Fulfilled, countKey: 'fulfilled' },
  { value: CustomerOrderStatus.Completed, countKey: 'completed' },
  { value: CustomerOrderStatus.Refunded, countKey: 'refunded' },
  { value: CustomerOrderStatus.Cancelled, countKey: 'cancelled' },
];

function CustomerOrders() {
  const { t } = useTranslation('customerPortal');
  const { confirm, confirmDialog } = useConfirm();
  const [orders, setOrders] = useState<CustomerStagingOrder[]>([]);
  const [counts, setCounts] = useState<CustomerOrderCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const [tab, setTab] = useState<CustomerOrderStatus | 'all'>('all');
  const [heldOnly, setHeldOnly] = useState(false);
  // Seed từ `?search=` — chuông thông báo (ORD-5) điều hướng sang đây kèm mã
  // đơn để khách thấy ngay đúng đơn vừa được báo.
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushOpen, setPushOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Bấm thông báo khi ĐANG đứng ở trang này = navigate cùng route → component
  // KHÔNG remount nên `useState(initialSearch)` ở trên không chạy lại. Effect
  // này đồng bộ lại filter mỗi lần query `?search=` đổi, cũng reset về trang 1
  // và bỏ filter tab để đơn được báo chắc chắn nằm trong kết quả.
  useEffect(() => {
    const fromUrl = searchParams.get('search') ?? '';
    if (!fromUrl) return;
    setSearchInput(fromUrl);
    setSearch(fromUrl);
    setTab('all');
    setHeldOnly(false);
    setPage(1);
  }, [searchParams]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    RepositoryRemote.customerOrder
      .getCounts()
      .then((res) => setCounts(res?.data?.data ?? null))
      .catch(() => {
        /* counts lỗi thì tab vẫn dùng được, chỉ thiếu số */
      });
  }, [refreshKey]);

  useEffect(() => {
    setLoading(true);
    RepositoryRemote.customerOrder
      .listOrders(page, pageSize, { search, status: tab === 'all' ? '' : tab, held: heldOnly })
      .then((res) => {
        setOrders(res?.data?.data ?? []);
        setTotal(res?.data?.total ?? 0);
      })
      .catch(handleAxiosError)
      .finally(() => setLoading(false));
  }, [page, pageSize, search, tab, heldOnly, refreshKey]);

  // Đổi tab/filter → reset chọn + trang.
  useEffect(() => {
    setSelected(new Set());
    setPage(1);
  }, [tab, heldOnly, search]);

  const pendingOrders = useMemo(() => orders.filter((o) => o.status === CustomerOrderStatus.Pending), [orders]);
  const allPendingSelected = pendingOrders.length > 0 && pendingOrders.every((o) => selected.has(o._id));
  const detailOrder = useMemo(() => orders.find((o) => o._id === detailId) ?? null, [orders, detailId]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allPendingSelected ? new Set() : new Set(pendingOrders.map((o) => o._id)));
  };

  const cancelOrder = async (order: CustomerStagingOrder) => {
    const ok = await confirm({
      title: t('orders.cancelConfirm', { name: orderDisplayCode(order) }),
      destructive: true,
    });
    if (!ok) return;
    try {
      await RepositoryRemote.customerOrder.cancelStagingOrder(order._id);
      toast.success(t('orders.cancelSuccess'));
      setDetailId(null);
      refresh();
    } catch (error) {
      handleAxiosError(error);
    }
  };

  const openPush = (id: string) => {
    setSelected(new Set([id]));
    setPushOpen(true);
  };

  const applySearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setHeldOnly(false);
    setPage(1);
  };

  const hasFilter = !!search || heldOnly;
  const emptyBecauseFilter = orders.length === 0 && (hasFilter || tab !== 'all');

  return (
    <div>
      {confirmDialog}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{t('orders.title')}</h1>
          {!loading && total > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{t('orders.resultsCount', { count: total })}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link to={PATHS.CUSTOMER_ORDER_IMPORT}>
            <Button size="sm" variant="secondary">
              <FileUp size={14} className="mr-1.5" />
              {t('orders.importCsv')}
            </Button>
          </Link>
          <Link to={PATHS.CUSTOMER_ORDER_NEW}>
            <Button size="sm">
              <PackagePlus size={14} className="mr-1.5" />
              {t('layout.newOrder')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Tab bar 8 trạng thái + count badge */}
      <div className="mb-3 flex items-center gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map(({ value, countKey }) => {
          const active = tab === value;
          const count = counts ? counts[countKey] : undefined;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
                active ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`orders.tabs.${value}`)}
              {count != null && count > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-primary-foreground/20' : 'bg-background'}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
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
            className="h-9 w-64 pl-8 text-sm"
          />
        </div>

        {/* Chip "On Hold" — cờ chồng, KHÔNG phải tab (plan §1.2) */}
        <button
          type="button"
          onClick={() => setHeldOnly((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
            heldOnly
              ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <PauseCircle size={12} />
          {t('orders.badgeHold')}
          {counts && counts.held > 0 && <span className="text-[10px]">({counts.held})</span>}
        </button>

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

        {selected.size > 0 && (
          <Button size="sm" className="ml-auto" onClick={() => setPushOpen(true)}>
            <Factory size={14} className="mr-1.5" />
            {t('orders.pushSelected', { count: selected.size })}
          </Button>
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
            <button
              type="button"
              onClick={() => {
                clearFilters();
                setTab('all');
              }}
              className="text-primary text-sm hover:underline mt-2"
            >
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
                  <TableHead className="w-8">
                    {tab === CustomerOrderStatus.Pending && pendingOrders.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allPendingSelected}
                        onChange={toggleSelectAll}
                        aria-label={t('actions.selectAll', { ns: 'common' })}
                        className="accent-primary"
                      />
                    )}
                  </TableHead>
                  <TableHead>{t('orders.columns.order')}</TableHead>
                  <TableHead>{t('orders.columns.items')}</TableHead>
                  <TableHead>{t('orders.columns.customer')}</TableHead>
                  <TableHead>{t('orders.columns.status')}</TableHead>
                  <TableHead>{t('orders.columns.tracking')}</TableHead>
                  <TableHead className="text-right">{t('orders.columns.total')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const isPending = order.status === CustomerOrderStatus.Pending;
                  const code = orderDisplayCode(order);
                  const firstItem = order.items[0];
                  const extraItems = order.items.length - 1;
                  const addr = order.shippingAddress;
                  const tracked = order.items.find((i) => i.tracking?.number || i.tracking?.labelUrl)?.tracking;
                  return (
                    <TableRow
                      key={order._id}
                      className={order.status === CustomerOrderStatus.Cancelled ? 'opacity-60' : undefined}
                    >
                      <TableCell className="align-top pt-3.5">
                        {isPending && (
                          <input
                            type="checkbox"
                            checked={selected.has(order._id)}
                            onChange={() => toggleSelect(order._id)}
                            aria-label={t('actions.select', { ns: 'common' })}
                            className="accent-primary"
                          />
                        )}
                      </TableCell>

                      {/* Mã đơn: bấm → drawer chi tiết */}
                      <TableCell className="align-top">
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailId(order._id)}
                              className="font-mono text-xs font-semibold text-primary hover:underline"
                            >
                              #{code}
                            </button>
                            <CopyButton value={code} label={t('orders.columns.code')} />
                          </span>
                          {order.orderId && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                              {t('orderDetail.reference')}: {order.orderId}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            {t(`orders.source.${order.source}`)} ·{' '}
                            {dayjs(order.pushedAt ?? order.createdAt).format('DD/MM/YYYY HH:mm')}
                          </p>
                        </div>
                      </TableCell>

                      {/* Sản phẩm */}
                      <TableCell className="align-top">
                        <div className="flex items-start gap-2">
                          {firstItem?.mockupUrl ? (
                            <img
                              src={firstItem.mockupUrl}
                              alt=""
                              className="w-10 h-10 rounded object-cover border border-border bg-muted shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground shrink-0">
                              <ImageIcon size={12} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs truncate max-w-[200px]">{firstItem?.type || firstItem?.sku || '—'}</p>
                            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                              {[firstItem?.sku, [firstItem?.color, firstItem?.size].filter(Boolean).join('/')]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                            {extraItems > 0 && (
                              <button
                                type="button"
                                onClick={() => setDetailId(order._id)}
                                className="text-[10px] text-primary hover:underline"
                              >
                                {t('orders.moreItems', { count: extraItems })}
                              </button>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Khách nhận */}
                      <TableCell className="align-top">
                        {addr ? (
                          <div className="text-[11px] leading-4 max-w-[170px]">
                            <p className="font-medium truncate">
                              {[addr.firstName, addr.lastName].filter(Boolean).join(' ') || '—'}
                            </p>
                            <p className="text-muted-foreground truncate">
                              {[addr.address1, addr.city, addr.postcode].filter(Boolean).join(', ')}
                            </p>
                            <p className="text-muted-foreground truncate">
                              {[addr.state, addr.country].filter(Boolean).join(' - ')}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Trạng thái + thanh toán + badge chồng */}
                      <TableCell className="align-top">
                        <div className="flex flex-col items-start gap-1">
                          <CustomerOrderStatusBadge status={order.status} />
                          <CustomerOrderPaymentBadge status={order.status} />
                          <CustomerOrderOverlayBadges held={order.held} rework={order.rework} />
                        </div>
                      </TableCell>

                      {/* Tracking khách tự cấp */}
                      <TableCell className="align-top">
                        {tracked ? (
                          <div className="text-[10px] max-w-[150px]">
                            {tracked.number && <p className="font-mono truncate">{tracked.number}</p>}
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              {tracked.carrier && (
                                <Badge variant="outline" className="text-[9px]">
                                  {tracked.carrier}
                                </Badge>
                              )}
                              {tracked.labelUrl && (
                                <a
                                  href={tracked.labelUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {t('orderDetail.shippingLabel')}
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top text-right text-xs whitespace-nowrap">
                        {order.totalAmount != null ? formatUsd(order.totalAmount) : '—'}
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDetailId(order._id)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={t('orders.viewDetail')}
                            title={t('orders.viewDetail')}
                          >
                            <Eye size={14} />
                          </button>
                          {isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => openPush(order._id)}
                                className="text-xs text-primary hover:underline"
                              >
                                {t('orders.pushOne')}
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelOrder(order)}
                                className="text-xs text-destructive hover:underline"
                              >
                                {t('actions.cancel', { ns: 'common' })}
                              </button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      <CustomerOrderDetailDrawer
        open={!!detailOrder}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        order={detailOrder}
        onPush={openPush}
        onCancel={cancelOrder}
        onUpdated={refresh}
      />

      <PushToProductionDialog
        open={pushOpen}
        onOpenChange={setPushOpen}
        ids={[...selected]}
        onPushed={() => {
          setSelected(new Set());
          setDetailId(null);
          refresh();
        }}
      />
    </div>
  );
}

export default CustomerOrders;
