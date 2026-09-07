'use client';

import dayjs from 'dayjs';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, PauseCircle, Wrench } from 'lucide-react';
import { CustomerOrderStatus } from 'shared/enums';
import type { AdminCustomerStagingOrder } from 'shared';
import { ViewAsButton } from '@/components/hub/view-as-button';
import { ProductLineBadge, StatusBadge } from '@/components/shared/badge';
import { CopyButton } from '@/components/shared/copy-button';
import { SafeImage } from '@/components/shared/safe-image';
import { orderDisplayCode } from '@/lib/customer-orders';
import { driveThumbnailUrl } from '@/lib/label-preview';
import { fmtUSD } from '@/lib/utils';

interface OrderRowProps {
  order: AdminCustomerStagingOrder | (Omit<AdminCustomerStagingOrder, 'customerId'> & { customerId?: string });
  /** Khu `/hub`: cột Seller + nút "Mở như seller" thay cho link chi tiết/push/hủy. */
  adminMode?: boolean;
  selected: boolean;
  onToggle: () => void;
  onPushOne: () => void;
  onCancel: () => void;
}

/** Mirror cột của `apps/web/src/pages/customer/orders/index.tsx` + cột dòng sản phẩm. */
export function OrderRow({ order, adminMode = false, selected, onToggle, onPushOne, onCancel }: OrderRowProps) {
  const { t } = useTranslation(['customerPortal', 'seller', 'hub']);
  const isPending = order.status === CustomerOrderStatus.Pending;
  const code = orderDisplayCode(order);
  const first = order.items[0];
  const extra = order.items.length - 1;
  const addr = order.shippingAddress;
  const tracked = order.items.find((i) => i.tracking?.number)?.tracking;
  const detailHref = !adminMode && first?.productionId ? `/portal/orders/${encodeURIComponent(first.productionId)}` : null;
  const thumb = first?.mockupUrl ? (driveThumbnailUrl(first.mockupUrl, 100) ?? first.mockupUrl) : null;

  return (
    <tr className={`border-t border-border2 hover:bg-card-hover transition-colors ${order.status === CustomerOrderStatus.Cancelled ? 'opacity-60' : ''}`}>
      <td className="px-3 py-2.5 align-top w-8">
        {!adminMode && isPending && <input type="checkbox" checked={selected} onChange={onToggle} className="accent-[var(--color-accent)]" />}
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="space-y-0.5">
          <span className="inline-flex items-center gap-1">
            {detailHref ? (
              <Link href={detailHref} prefetch={false} className="font-mono text-xs font-semibold text-accent hover:underline">
                #{code}
              </Link>
            ) : (
              <span className="font-mono text-xs font-semibold text-text-primary">#{code}</span>
            )}
            <CopyButton text={code} size={11} />
          </span>
          {order.orderId && order.orderId !== code && (
            <p className="text-[10px] text-text-muted truncate max-w-[160px]">
              {t('customerPortal:orderDetail.reference')}: {order.orderId}
            </p>
          )}
          <p className="text-[10px] text-text-muted">
            {t(`customerPortal:orders.source.${order.source}`)} · {dayjs(order.pushedAt ?? order.createdAt).format('DD/MM/YYYY HH:mm')}
          </p>
        </div>
      </td>
      {adminMode && (
        <td className="px-3 py-2.5 align-top">
          <p className="text-xs font-semibold text-text-primary">{order.customer?.userSku || '—'}</p>
          <p className="text-[10px] text-text-muted truncate max-w-[160px]">{order.customer?.userEmail}{order.customer?.tier != null ? ` · VIP ${order.customer.tier}` : ''}</p>
        </td>
      )}
      <td className="px-3 py-2.5 align-top">
        <div className="flex items-start gap-2">
          <SafeImage
            src={thumb}
            alt=""
            className="w-10 h-10 rounded object-cover border border-border1 bg-surface-muted shrink-0"
            fallback={
              <div className="w-10 h-10 rounded border border-dashed border-border1 flex items-center justify-center text-text-muted shrink-0">
                <ImageIcon size={12} />
              </div>
            }
          />
          <div className="min-w-0">
            <p className="text-xs truncate max-w-[220px] text-text-primary">{first?.type || first?.sku || '—'}</p>
            <p className="text-[10px] text-text-muted font-mono truncate max-w-[220px]">
              {[first?.sku, [first?.color, first?.size].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
              {first?.quantity ? ` · ×${first.quantity}` : ''}
            </p>
            {extra > 0 && <p className="text-[10px] text-accent">{t('customerPortal:orders.moreItems', { count: extra })}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex flex-wrap gap-1">
          {(order.productLines ?? []).map((l) => (
            <ProductLineBadge key={l} line={l} />
          ))}
        </div>
      </td>
      <td className="px-3 py-2.5 align-top">
        {addr ? (
          <div className="text-[11px] leading-4 max-w-[170px]">
            <p className="font-medium truncate text-text-primary">{[addr.firstName, addr.lastName].filter(Boolean).join(' ') || '—'}</p>
            <p className="text-text-muted truncate">{[addr.city, addr.state, addr.country].filter(Boolean).join(', ')}</p>
          </div>
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={order.status} />
          {(order.held || order.rework) && (
            <span className="inline-flex gap-1">
              {order.held && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning">
                  <PauseCircle size={10} /> {t('customerPortal:orders.badgeHold')}
                </span>
              )}
              {order.rework && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: '#b45309' }}>
                  <Wrench size={10} /> {t('customerPortal:orders.badgeRework')}
                </span>
              )}
            </span>
          )}
          {first?.currentStageLabel && !isPending && <span className="text-[10px] text-text-muted">{first.currentStageLabel}</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 align-top">
        {tracked?.number ? (
          <div className="text-[11px]">
            <p className="font-mono text-text-primary">{tracked.number}</p>
            {tracked.carrier && <p className="text-text-muted">{tracked.carrier}</p>}
          </div>
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 align-top text-right tabular-nums text-xs font-semibold text-text-primary">
        {order.totalAmount != null ? fmtUSD(order.totalAmount) : '—'}
      </td>
      <td className="px-3 py-2.5 align-top text-right whitespace-nowrap">
        {adminMode && order.customerId && (
          <ViewAsButton customerId={order.customerId} target={first?.productionId ? `/portal/orders/${encodeURIComponent(first.productionId)}` : '/portal/orders'} />
        )}
        {!adminMode && isPending && (
          <span className="inline-flex gap-1">
            <button type="button" onClick={onPushOne} className="px-2 py-1 rounded-md text-[10px] font-bold bg-cta text-cta-foreground hover:bg-cta-hover">
              {t('customerPortal:orders.pushOne')}
            </button>
            <button type="button" onClick={onCancel} className="px-2 py-1 rounded-md text-[10px] font-semibold text-error hover:bg-error-bg">
              {t('seller:detail.cancel')}
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}
