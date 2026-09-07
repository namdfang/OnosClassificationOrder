'use client';

import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, Loader2, PauseCircle, RefreshCw, Wrench } from 'lucide-react';
import type { AdminCustomerStagingOrder, CustomerOrderCounts } from 'shared';
import { SellerFilterPicker } from '@/components/hub/seller-filter-picker';
import { OrderCard } from '@/components/orders/order-card';
import { OrdersPagination } from '@/components/orders/orders-pagination';
import { OrdersStatsBar } from '@/components/orders/orders-stats-bar';
import { OrdersStatusFilterPills } from '@/components/orders/orders-status-filter-pills';
import { ProductLineTabs, type ProductLineTabKey } from '@/components/orders/product-line-tabs';
import { ProductLineBadge, StatusBadge } from '@/components/shared/badge';
import { CopyButton } from '@/components/shared/copy-button';
import { DateRangeFilter, type DateRange } from '@/components/shared/date-range-filter';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { SafeImage } from '@/components/shared/safe-image';
import { SearchInput } from '@/components/shared/search-input';
import { useApi } from '@/hooks/use-api';
import { useUrlState } from '@/hooks/use-url-state';
import { orderDisplayCode, type ApiRes } from '@/lib/customer-orders';
import { driveThumbnailUrl } from '@/lib/label-preview';
import { isProductLine } from '@/lib/product-lines';
import { fmtUSD } from '@/lib/utils';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const TH = 'py-2.5 px-2 text-left text-[9px] text-text-muted font-semibold uppercase tracking-wider';

/**
 * Đơn khách toàn hệ — khuôn `components/oms/orders-list-view.tsx` (trang OMS nội bộ của thghub):
 * header → lọc ngày → thẻ số → tab dịch vụ (6 dòng) → pill trạng thái → tìm/seller → bảng đầu xám
 * + phân trang trong card. CHỈ ĐỌC (SellerPortal.md §9), không CTA mạo danh ở đây.
 */
export function HubOrdersView() {
  const { t } = useTranslation(['hub', 'customerPortal', 'track']);
  const [state, setState] = useUrlState({ page: '1', limit: '20', status: '', held: '', q: '', line: '', seller: '', from: '', to: '' });
  const page = Math.max(1, Number(state.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(state.limit) || 20));
  const status = state.status || null;
  const heldOnly = state.held === '1';
  const line: ProductLineTabKey = isProductLine(state.line) ? state.line : 'all';
  const [searchInput, setSearchInput] = useState(state.q);
  const search = useDebounced(searchInput.trim(), 350);
  useEffect(() => {
    if (search !== state.q) setState({ q: search, page: '1' });
  }, [search, state.q, setState]);
  const dateRange: DateRange = { dateFrom: state.from || null, dateTo: state.to || null };

  const base = useMemo(() => {
    const p = new URLSearchParams();
    if (state.seller) p.set('customerId', state.seller);
    if (state.from) p.set('dateFrom', state.from);
    if (state.to) p.set('dateTo', state.to);
    return p;
  }, [state.seller, state.from, state.to]);
  const listQuery = useMemo(() => {
    const p = new URLSearchParams(base);
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (status) p.set('status', status);
    if (heldOnly) p.set('held', 'true');
    if (search) p.set('search', search);
    if (line !== 'all') p.set('productLine', line);
    return p.toString();
  }, [base, page, limit, status, heldOnly, search, line]);
  const lineCountsQuery = base.toString();
  const pillCountsQuery = useMemo(() => {
    const p = new URLSearchParams(base);
    if (line !== 'all') p.set('productLine', line);
    return p.toString();
  }, [base, line]);

  const { data: listRes, loading, refetch } = useApi<ApiRes<AdminCustomerStagingOrder[]>>(`/api/hub/v1/admin/customer-orders?${listQuery}`);
  const { data: lineCountsRes } = useApi<ApiRes<CustomerOrderCounts>>(`/api/hub/v1/admin/customer-orders/counts${lineCountsQuery ? `?${lineCountsQuery}` : ''}`);
  const { data: countsRes } = useApi<ApiRes<CustomerOrderCounts>>(`/api/hub/v1/admin/customer-orders/counts${pillCountsQuery ? `?${pillCountsQuery}` : ''}`);
  const orders = listRes?.data ?? [];
  const total = listRes?.total ?? 0;
  const counts = countsRes?.data ?? null;
  const lineCounts = useMemo(() => {
    const c = lineCountsRes?.data;
    return c ? ({ all: c.all, ...(c.byProductLine ?? {}) } as Partial<Record<ProductLineTabKey, number>>) : undefined;
  }, [lineCountsRes]);
  const pages = Math.max(1, Math.ceil(total / limit));
  const noop = () => undefined;

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('hub:orders.title')}
        subtitle={t('hub:orders.subtitleOms')}
        actions={
          <button type="button" onClick={refetch} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border1 bg-card text-[10px] font-bold text-text-secondary hover:bg-card-hover">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />{t('hub:orders.refresh')}
          </button>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <DateRangeFilter value={dateRange} onChange={(r) => setState({ from: r.dateFrom ?? '', to: r.dateTo ?? '', page: '1' })} />
      </div>

      <OrdersStatsBar counts={counts} />

      <ProductLineTabs active={line} counts={lineCounts} onChange={(next) => setState({ line: next === 'all' ? '' : next, page: '1', status: '' })} />

      <OrdersStatusFilterPills active={status} counts={counts} heldOnly={heldOnly} onToggleHeld={() => setState({ held: heldOnly ? '' : '1', page: '1' })} onChange={(s) => setState({ status: s ?? '', page: '1' })} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder={t('hub:orders.searchPlaceholder')} className="w-full sm:w-72" />
          <SellerFilterPicker value={state.seller} onChange={(id) => setState({ seller: id, page: '1' })} />
        </div>
        <div className="text-[10px] text-text-muted tabular-nums">{t('hub:orders.totalOrders', { count: total })}</div>
      </div>

      <div className="bg-card border border-border1 rounded-xl overflow-hidden">
        {loading && orders.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-[13px] text-text-muted"><Loader2 size={16} className="animate-spin mr-2" />{t('hub:common.loading')}</div>
        ) : orders.length === 0 ? (
          <EmptyState title={t('customerPortal:orders.emptyFiltered')} icon={<span className="text-[40px]">📦</span>} />
        ) : (
          <>
            <div className={`md:hidden divide-y divide-border2 ${loading ? 'opacity-60' : ''}`}>
              {orders.map((o) => (
                <div key={o._id} className="p-2"><OrderCard order={o} adminMode showViewAs={false} selected={false} onToggle={noop} onPushOne={noop} onCancel={noop} /></div>
              ))}
            </div>
            <div className={`hidden md:block overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
              <table className="w-full min-w-[1080px]">
                <thead className="bg-surface-muted">
                  <tr className="border-b border-border2">
                    <th className={TH}>{t('customerPortal:orders.columns.order')}</th>
                    <th className={TH}>{t('hub:orders.columns.seller')}</th>
                    <th className={TH}>{t('customerPortal:orders.columns.product')}</th>
                    <th className={TH}>{t('hub:orders.columns.service')}</th>
                    <th className={`${TH} text-right`}>{t('customerPortal:orders.columns.quantity')}</th>
                    <th className={`${TH} text-right`}>{t('customerPortal:orders.columns.total')}</th>
                    <th className={TH}>{t('customerPortal:orders.columns.status')}</th>
                    <th className={TH}>{t('customerPortal:orders.columns.customer')}</th>
                    <th className={TH}>{t('customerPortal:orders.columns.tracking')}</th>
                    <th className={TH}>{t('hub:orders.columns.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const code = orderDisplayCode(o);
                    const first = o.items[0];
                    const extra = o.items.length - 1;
                    const thumb = first?.mockupUrl ? (driveThumbnailUrl(first.mockupUrl, 100) ?? first.mockupUrl) : null;
                    const qty = o.totalQuantity ?? o.items.reduce((s, i) => s + (i.quantity ?? 0), 0);
                    const tracked = o.items.find((i) => i.tracking?.number)?.tracking;
                    const stage = first?.currentStageKey ? t(`track:progress.stages.${first.currentStageKey}`, { defaultValue: first.currentStageLabel ?? '' }) : first?.currentStageLabel;
                    const addr = o.shippingAddress;
                    return (
                      <tr key={o._id} className={`border-b border-border2 last:border-0 hover:bg-card-hover align-top ${o.status === 'cancelled' ? 'opacity-60' : ''}`}>
                        <td className="py-2.5 px-2">
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-text-primary whitespace-nowrap">#{code}<CopyButton text={code} size={10} /></span>
                          {o.orderId && o.orderId !== code && <p className="text-[9.5px] text-text-muted truncate max-w-[150px]">{o.orderId}</p>}
                          <p className="text-[9.5px] text-text-muted">{t(`customerPortal:orders.source.${o.source}`)}</p>
                        </td>
                        <td className="py-2.5 px-2">
                          <button type="button" onClick={() => setState({ seller: o.customerId, page: '1' })} className="text-[11px] font-bold text-text-primary hover:text-accent">{o.customer?.userSku || '—'}</button>
                          <p className="text-[9.5px] text-text-muted truncate max-w-[160px]">{o.customer?.userEmail}{o.customer?.tier != null ? ` · VIP ${o.customer.tier}` : ''}</p>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-start gap-2">
                            <SafeImage src={thumb} alt="" className="w-9 h-9 rounded object-cover border border-border1 bg-surface-muted shrink-0" fallback={<div className="w-9 h-9 rounded border border-dashed border-border1 flex items-center justify-center text-text-muted shrink-0"><ImageIcon size={11} /></div>} />
                            <div className="min-w-0">
                              <p className="text-[11px] text-text-primary truncate max-w-[220px]">{first?.type || first?.sku || '—'}</p>
                              <p className="text-[9.5px] text-text-muted font-mono truncate max-w-[220px]">{[first?.sku, [first?.color, first?.size].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</p>
                              {extra > 0 && <p className="text-[9.5px] text-accent">{t('customerPortal:orders.moreItems', { count: extra })}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-2"><div className="flex flex-wrap gap-1">{(o.productLines ?? []).map((l) => <ProductLineBadge key={l} line={l} />)}</div></td>
                        <td className="py-2.5 px-2 text-right text-[11px] tabular-nums">{qty}</td>
                        <td className="py-2.5 px-2 text-right text-[11px] font-semibold tabular-nums">{o.totalAmount != null ? fmtUSD(o.totalAmount) : '—'}</td>
                        <td className="py-2.5 px-2">
                          <div className="flex flex-col items-start gap-0.5">
                            <StatusBadge status={o.status} />
                            {(o.held || o.rework) && (
                              <span className="inline-flex gap-1.5 text-[9.5px] font-semibold text-warning">
                                {o.held && <span className="inline-flex items-center gap-0.5"><PauseCircle size={9} />{t('customerPortal:orders.badgeHold')}</span>}
                                {o.rework && <span className="inline-flex items-center gap-0.5"><Wrench size={9} />{t('customerPortal:orders.badgeRework')}</span>}
                              </span>
                            )}
                            {stage && o.status !== 'pending' && <span className="text-[9.5px] text-text-muted">{stage}</span>}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-[10.5px]">
                          {addr ? (<><p className="text-text-primary truncate max-w-[140px]">{[addr.firstName, addr.lastName].filter(Boolean).join(' ') || '—'}</p><p className="text-text-muted truncate max-w-[140px]">{[addr.city, addr.state, addr.country].filter(Boolean).join(', ')}</p></>) : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-[10.5px]">{tracked?.number ? (<><p className="font-mono text-text-primary">{tracked.number}</p>{tracked.carrier && <p className="text-text-muted">{tracked.carrier}</p>}</>) : <span className="text-text-muted">—</span>}</td>
                        <td className="py-2.5 px-2 text-[10.5px] text-text-secondary whitespace-nowrap">{dayjs(o.pushedAt ?? o.createdAt).format('DD/MM/YYYY HH:mm')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        <OrdersPagination page={page} limit={limit} pages={pages} total={total} onChange={(n) => setState({ ...(n.page ? { page: String(n.page) } : {}), ...(n.limit ? { limit: String(n.limit), page: '1' } : {}) })} />
      </div>
    </div>
  );
}
