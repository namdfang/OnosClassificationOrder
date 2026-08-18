import type { ReactNode } from 'react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { Check, ExternalLink, Factory, ImageIcon, XCircle } from 'lucide-react';
import type { CustomerShipMethod, CustomerStagingItem, CustomerStagingOrder, ProductionOrderShippingAddress } from 'shared';
import { CUSTOMER_ORDER_STATUS_PROGRESS, CUSTOMER_SHIP_METHODS, CustomerOrderStatus } from 'shared';
import { toast } from 'sonner';

import { PATHS } from '@/constants/paths';

import { CopyButton } from '@/components/common/CopyButton';
import { Spinner } from '@/components/common/Spinner';
import {
  CustomerOrderOverlayBadges,
  CustomerOrderPaymentBadge,
  CustomerOrderStatusBadge,
} from '@/components/customer/CustomerOrderBadges';
import { formatUsd } from '@/components/customer/PushToProductionDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

import { RepositoryRemote } from '../../services';
import { handleAxiosError } from '../../utils';
import { driveThumbUrl, driveViewUrl } from '../../utils/driveThumb';

/** Mã hiển thị mức ĐƠN = productionId item đầu (đa số đơn form là 1 item). */
export function orderDisplayCode(order: CustomerStagingOrder): string {
  return order.items[0]?.productionId || order.orderId || order.orderName || `#${order._id.slice(-6)}`;
}

const ADDRESS_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'email',
  'company',
  'address1',
  'address2',
  'city',
  'state',
  'postcode',
  'country',
] as const;
type AddressField = (typeof ADDRESS_FIELDS)[number];

interface CustomerOrderDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: CustomerStagingOrder | null;
  /** Mở dialog Push to production cho đơn này (parent giữ dialog + selected). */
  onPush: (id: string) => void;
  /** Hủy đơn pending (parent confirm + gọi API + refresh). */
  onCancel: (order: CustomerStagingOrder) => void;
  /** Reload listing sau khi sửa địa chỉ/ghi chú trong drawer. */
  onUpdated: () => void;
}

/** Card khối thông tin — mirror layout Card của trang chi tiết hệ OnosPod cũ. */
function DetailCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/** Mốc "Sản xuất xong" = currentStageAt muộn nhất của các item đã Fulfilled/Completed. */
function manufacturedAt(order: CustomerStagingOrder): Date | undefined {
  const dates = order.items
    .filter((i) => i.status === CustomerOrderStatus.Fulfilled || i.status === CustomerOrderStatus.Completed)
    .map((i) => i.currentStageAt)
    .filter((d): d is Date => !!d);
  if (dates.length === 0) return undefined;
  return dates.reduce((a, b) => (dayjs(a).isAfter(b) ? a : b));
}

/**
 * Stepper ngang 5 chặng — mirror ORDER ACTIVITY hệ cũ (Created → Sent to
 * fulfillment → Manufacturing Finished → Picked Up → Delivered). Picked
 * Up/Delivered chưa có tích hợp carrier: Picked Up suy từ (đã sản xuất xong +
 * có tracking number) hoặc đơn Completed; Delivered ≈ Completed (Fulfilled +
 * N ngày config).
 */
function ActivityStepper({ order }: { order: CustomerStagingOrder }) {
  const { t } = useTranslation('customerPortal');
  const progress = CUSTOMER_ORDER_STATUS_PROGRESS[order.status] ?? 0;
  const hasTracking = order.items.some((i) => i.tracking?.number);
  const mfgAt = manufacturedAt(order);
  const pickedUp = (progress >= 3 && hasTracking) || progress >= 4;
  const steps = [
    { key: 'created', active: true, done: !!order.pushedAt, at: order.createdAt },
    { key: 'pushed', active: !!order.pushedAt, done: progress >= 3, at: order.pushedAt },
    { key: 'manufactured', active: progress >= 3, done: pickedUp, at: mfgAt },
    { key: 'pickedUp', active: pickedUp, done: progress >= 4, at: undefined as Date | undefined },
    { key: 'delivered', active: progress >= 4, done: false, at: undefined as Date | undefined },
  ];
  return (
    <div className="flex items-start pt-1">
      {steps.map((step, i) => (
        <div key={step.key} className="flex-1 flex flex-col items-center relative">
          {i > 0 && (
            <span
              className={`absolute top-[9px] right-1/2 w-full h-0.5 ${step.active ? 'bg-primary' : 'bg-border'}`}
            />
          )}
          <span
            className={`relative z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              step.active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
            }`}
          >
            {step.done && <Check size={11} strokeWidth={3} />}
          </span>
          <p className={`mt-1.5 text-[11px] text-center ${step.active ? 'font-medium' : 'text-muted-foreground'}`}>
            {t(`orderDetail.steps.${step.key}`)}
          </p>
          {step.at && (
            <p className="text-[10px] text-muted-foreground">{dayjs(step.at).format('DD/MM/YYYY HH:mm')}</p>
          )}
        </div>
      ))}
    </div>
  );
}

interface OrderRecord {
  key: string;
  at: Date;
  title: string;
  desc?: string;
  color: string;
}

/**
 * Card "Order Records" — timeline nhật ký mirror hệ cũ, derive thuần FE từ
 * mốc thời gian staging + item (chưa có audit log riêng cho đơn khách; KHÔNG
 * lộ OrderLog nội bộ ra portal).
 */
function OrderRecords({ order }: { order: CustomerStagingOrder }) {
  const { t } = useTranslation('customerPortal');
  const records: OrderRecord[] = [];
  if (order.createdAt) {
    records.push({
      key: 'created',
      at: order.createdAt,
      title: t('orderDetail.records.created'),
      desc: t('orderDetail.records.createdDesc', { source: t(`orders.source.${order.source}`) }),
      color: 'bg-primary',
    });
  }
  if (order.pushedAt) {
    const codes = order.items.map((i) => i.productionId).filter(Boolean).join(', ');
    records.push({
      key: 'pushed',
      at: order.pushedAt,
      title: t('orderDetail.records.pushed'),
      desc: codes ? t('orderDetail.records.pushedDesc', { codes }) : undefined,
      color: 'bg-sky-500',
    });
  }
  for (const item of order.items) {
    if (
      (item.status === CustomerOrderStatus.Fulfilled || item.status === CustomerOrderStatus.Completed) &&
      item.currentStageAt
    ) {
      records.push({
        key: `manufactured-${item.productionId}`,
        at: item.currentStageAt,
        title: t('orderDetail.records.manufactured'),
        desc: item.productionId ? `#${item.productionId}` : undefined,
        color: 'bg-emerald-500',
      });
    }
  }
  if (order.cancelledAt) {
    records.push({
      key: 'cancelled',
      at: order.cancelledAt,
      title: t('orderDetail.records.cancelled'),
      desc: order.cancelReason,
      color: 'bg-destructive',
    });
  }
  records.sort((a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf());

  if (records.length === 0) return <p className="text-xs text-muted-foreground">—</p>;
  return (
    <ul>
      {records.map((r, i) => (
        <li key={r.key} className="relative flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <span className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${r.color}`} />
            {i < records.length - 1 && <span className="w-px flex-1 bg-border mt-1" />}
          </div>
          <div className="min-w-0 flex-1 -mt-0.5">
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <p className="text-xs font-medium">{r.title}</p>
              <span className="text-[10px] text-muted-foreground">{dayjs(r.at).format('DD/MM/YYYY HH:mm')}</span>
            </div>
            {r.desc && <p className="text-[11px] text-muted-foreground break-words">{r.desc}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 1 item trong card ORDER DETAILS — mockup lớn + design thumbnails + dòng PRODUCTIONS. */
function ItemBlock({ item }: { item: CustomerStagingItem }) {
  const { t } = useTranslation('customerPortal');
  const designEntries = Object.entries(item.designs ?? {}).filter(([, url]) => !!url) as Array<[string, string]>;
  const snap = item.priceSnapshot;
  const fulfillLine = [item.type, item.color, item.size].filter(Boolean).join(' / ');
  return (
    <div className="border-t border-border/60 py-4 first:border-t-0 first:pt-1">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Mockup lớn */}
        {item.mockupUrl ? (
          <a href={driveViewUrl(item.mockupUrl)} target="_blank" rel="noreferrer" className="shrink-0">
            <img
              src={driveThumbUrl(item.mockupUrl, 400)}
              alt={item.type || item.sku}
              className="w-36 h-36 rounded-md object-cover border border-border bg-muted"
            />
          </a>
        ) : (
          <div className="w-36 h-36 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground shrink-0">
            <ImageIcon size={24} />
          </div>
        )}

        <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{item.type || item.sku || '—'}</p>
              <div className="text-xs whitespace-nowrap text-right">
                {snap ? (
                  <>
                    <p>
                      {snap.discountedPrice != null && (
                        <span className="line-through text-muted-foreground mr-1">{formatUsd(snap.unitPrice)}</span>
                      )}
                      <span className="font-semibold">{formatUsd(snap.discountedPrice ?? snap.unitPrice)}</span>
                      <span className="text-muted-foreground"> × {item.quantity}</span>
                    </p>
                    <p className="font-semibold">{formatUsd(snap.lineTotal)}</p>
                    {snap.promotionName && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{snap.promotionName}</p>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">× {item.quantity}</span>
                )}
              </div>
            </div>
            {item.sku && (
              <p className="text-[10px] font-semibold">
                {t('orderDetail.idLabel')}: <span className="font-mono font-normal">{item.sku}</span>
              </p>
            )}
            {item.merchantSku && (
              <p className="text-[10px] flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold">{t('orderDetail.merchantLabel')}:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-pink-600 dark:text-pink-400">{item.merchantSku}</code>
              </p>
            )}
            {fulfillLine && (
              <p className="text-[10px] flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold">{t('orderDetail.fulfillLabel')}:</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-pink-600 dark:text-pink-400">{fulfillLine}</code>
                <span className="text-muted-foreground uppercase">{item.shipMethod}</span>
              </p>
            )}
          </div>

          {/* Design thumbnails */}
          {designEntries.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {designEntries.map(([key, url]) => (
                <a
                  key={key}
                  href={driveViewUrl(url)}
                  target="_blank"
                  rel="noreferrer"
                  className="relative w-20 h-20 rounded-md border border-border overflow-hidden bg-muted group"
                  title={key}
                >
                  <img
                    src={driveThumbUrl(url, 200)}
                    alt={key}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-background/85 text-[9px] text-center truncate px-1">
                    {key}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PRODUCTIONS — mã sản xuất + chặng hiện tại của item */}
      <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">
          {t('orderDetail.productionsTitle')}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {item.productionId && (
            <span className="inline-flex items-center gap-1 text-xs font-mono font-medium">
              {item.status ? (
                <Link
                  to={PATHS.CUSTOMER_ORDER_DETAIL.replace(':productionId', item.productionId)}
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  #{item.productionId}
                  <ExternalLink size={10} />
                </Link>
              ) : (
                <span>#{item.productionId}</span>
              )}
              <CopyButton value={item.productionId} label={t('orders.columns.code')} />
            </span>
          )}
          {fulfillLine && <span className="text-[10px] text-muted-foreground">{fulfillLine}</span>}
          {item.status ? (
            <span className="inline-flex items-center gap-1 flex-wrap">
              <CustomerOrderStatusBadge status={item.status} />
              <CustomerOrderOverlayBadges held={item.held} rework={item.rework} holdReason={item.holdReason} />
              {item.currentStageLabel && (
                <span className="text-[10px] text-muted-foreground">
                  {item.currentStageLabel}
                  {item.currentStageAt ? ` · ${dayjs(item.currentStageAt).fromNow()}` : ''}
                </span>
              )}
            </span>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              {t('orders.notPushed')}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Drawer chi tiết 1 ĐƠN staging — mở khi bấm productionId ở listing. Layout 2
 * cột mirror trang chi tiết hệ OnosPod cũ: trái = ORDER ACTIVITY (stepper +
 * tracking summary) + ORDER DETAILS (item lớn, design thumbs, PRODUCTIONS,
 * totals); phải = SHIPPING ADDRESS (sửa được khi pending) + SHIPPING METHOD +
 * BUYER NOTE + TRACKING (kèm preview shipping label PDF).
 */
export function CustomerOrderDetailDrawer({
  open,
  onOpenChange,
  order,
  onPush,
  onCancel,
  onUpdated,
}: CustomerOrderDetailDrawerProps) {
  const { t } = useTranslation('customerPortal');
  const [address, setAddress] = useState<ProductionOrderShippingAddress>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const isPending = order?.status === CustomerOrderStatus.Pending;

  useEffect(() => {
    setAddress(order?.shippingAddress ?? {});
    setNote(order?.note ?? '');
  }, [order?._id, order?.shippingAddress, order?.note]);

  if (!order) return null;

  const code = orderDisplayCode(order);
  const trackedItems = order.items.filter((i) => i.tracking && (i.tracking.number || i.tracking.labelUrl));
  const usedShipMethods = new Set(order.items.map((i) => i.shipMethod).filter(Boolean));
  const anyActiveService = order.items.some((i) => i.activeService);
  const addr = order.shippingAddress;

  const saveAddress = async () => {
    try {
      setSaving(true);
      await RepositoryRemote.customerOrder.updateStagingOrder(order._id, { shippingAddress: address });
      toast.success(t('orderDetail.saveSuccess'));
      onUpdated();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    try {
      setSaving(true);
      await RepositoryRemote.customerOrder.updateStagingOrder(order._id, { note });
      toast.success(t('orderDetail.saveSuccess'));
      onUpdated();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[94vw] sm:max-w-[1150px] overflow-y-auto p-0">
        <div className="p-5 sm:p-6 space-y-5">
          {/* Header: mã đơn + chips + actions — mirror header trang chi tiết hệ cũ */}
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <SheetHeader className="space-y-1.5">
              <SheetTitle className="flex items-center gap-2 font-mono text-lg">
                #{code}
                <CopyButton value={code} label={t('orders.columns.code')} />
              </SheetTitle>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {order.orderId && (
                  <p>
                    {t('orderDetail.reference')}: {order.orderId}
                    {order.identifier ? ` · ${order.identifier}` : ''}
                  </p>
                )}
                <p>
                  {t(`orders.source.${order.source}`)} · {dayjs(order.createdAt).format('DD/MM/YYYY HH:mm')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <CustomerOrderStatusBadge status={order.status} />
                <CustomerOrderPaymentBadge status={order.status} />
                {order.totalAmount != null && (
                  <Badge variant="outline" className="text-[10px]">
                    {formatUsd(order.totalAmount)}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px]">
                  {t('orders.itemCount', { count: order.items.length })}
                </Badge>
                <CustomerOrderOverlayBadges held={order.held} rework={order.rework} />
              </div>
            </SheetHeader>

            {isPending && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => onCancel(order)}>
                  <XCircle size={14} className="mr-1.5" />
                  {t('actions.cancel', { ns: 'common' })}
                </Button>
                <Button size="sm" onClick={() => onPush(order._id)}>
                  <Factory size={14} className="mr-1.5" />
                  {t('orderDetail.pushToProduction')}
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3 items-start">
            {/* ===== Cột trái (2/3) ===== */}
            <div className="lg:col-span-2 space-y-4">
              <DetailCard title={t('orderDetail.activityTitle')}>
                {order.status === CustomerOrderStatus.Cancelled ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
                    <XCircle size={14} />
                    {t('orderDetail.cancelledAt', {
                      date: order.cancelledAt ? dayjs(order.cancelledAt).format('DD/MM/YYYY HH:mm') : '—',
                    })}
                    {order.cancelReason ? ` — ${order.cancelReason}` : ''}
                  </div>
                ) : (
                  <ActivityStepper order={order} />
                )}
                {trackedItems.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3 space-y-1">
                    {trackedItems.map((item, i) => (
                      <div key={item.productionId ?? i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {item.tracking?.carrier && (
                          <Badge variant="secondary" className="text-[10px]">
                            {item.tracking.carrier}
                          </Badge>
                        )}
                        {item.tracking?.number &&
                          (item.tracking.url ? (
                            <a
                              href={item.tracking.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-primary hover:underline"
                            >
                              {item.tracking.number}
                            </a>
                          ) : (
                            <span className="font-mono">{item.tracking.number}</span>
                          ))}
                        {item.tracking?.labelUrl && (
                          <a
                            href={item.tracking.labelUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {t('orderDetail.shippingLabel')}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </DetailCard>

              <DetailCard title={t('orderDetail.itemsTitle')}>
                {order.items.map((item, i) => (
                  <ItemBlock key={item.productionId ?? i} item={item} />
                ))}

                {/* Totals — mirror Subtotal/Shipping/Total/Paid hệ cũ */}
                <div className="mt-4 flex justify-end border-t border-border pt-3">
                  <div className="text-xs space-y-1.5 w-56">
                    <div className="flex justify-between text-muted-foreground">
                      <span className="uppercase">{t('orderDetail.subtotal')}</span>
                      <span className="font-semibold text-foreground">
                        {order.totalAmount != null ? formatUsd(order.totalAmount) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span className="uppercase">{t('orderDetail.shippingFee')}</span>
                      <span className="font-semibold text-foreground">{formatUsd(0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="uppercase font-semibold">{t('orderDetail.total')}</span>
                      <span className="font-semibold">
                        {order.totalAmount != null ? formatUsd(order.totalAmount) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span className="uppercase">{t('orderDetail.paid')}</span>
                      <span className="font-semibold text-foreground">
                        {isPending ? formatUsd(0) : t('orders.paymentWaived')}
                      </span>
                    </div>
                  </div>
                </div>
              </DetailCard>

              <DetailCard title={t('orderDetail.records.title')}>
                <OrderRecords order={order} />
              </DetailCard>
            </div>

            {/* ===== Cột phải (1/3) ===== */}
            <div className="space-y-4">
              <DetailCard title={t('orderDetail.addressTitle')}>
                {!isPending && addr ? (
                  <div className="text-sm space-y-0.5">
                    <p className="font-medium">{[addr.firstName, addr.lastName].filter(Boolean).join(' ') || '—'}</p>
                    {addr.phone && <p className="text-muted-foreground text-xs">{addr.phone}</p>}
                    {addr.email && <p className="text-muted-foreground text-xs break-all">{addr.email}</p>}
                    {addr.company && <p className="text-muted-foreground text-xs">{addr.company}</p>}
                    <p className="text-muted-foreground text-xs">
                      {[addr.address1, addr.address2].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {[addr.city, addr.postcode].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {[addr.state, addr.country].filter(Boolean).join(', ')}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {ADDRESS_FIELDS.map((field: AddressField) => (
                        <div key={field} className={field === 'address1' || field === 'address2' ? 'col-span-2' : ''}>
                          <label className="text-[10px] text-muted-foreground" htmlFor={`addr-${field}`}>
                            {t(`orderDetail.address.${field}`)}
                          </label>
                          <Input
                            id={`addr-${field}`}
                            value={address[field] ?? ''}
                            readOnly={!isPending}
                            onChange={(e) => setAddress((prev) => ({ ...prev, [field]: e.target.value }))}
                            className={`h-8 text-xs ${!isPending ? 'bg-muted/50 border-transparent' : ''}`}
                          />
                        </div>
                      ))}
                    </div>
                    {isPending && (
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="secondary" onClick={saveAddress} disabled={saving}>
                          {saving && <Spinner size={12} className="mr-1.5" />}
                          {t('orderDetail.updateAddress')}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </DetailCard>

              <DetailCard title={t('orderDetail.shipMethodTitle')}>
                <div className="space-y-2">
                  {CUSTOMER_SHIP_METHODS.map((method: CustomerShipMethod) => {
                    const selected = usedShipMethods.has(method);
                    return (
                      <div
                        key={method}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                          selected ? 'border-primary bg-primary/5' : 'border-border opacity-60'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                            selected ? 'border-primary bg-primary' : 'border-border'
                          }`}
                        />
                        <div>
                          <p className="text-xs font-medium">{t(`orderDetail.shipMethods.${method}`)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {t(`orderDetail.shipMethodHints.${method}`)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {anyActiveService && (
                    <p className="text-[11px] flex items-center gap-1.5 text-muted-foreground">
                      <Check size={12} className="text-primary" />
                      {t('orderDetail.activeService')}
                    </p>
                  )}
                </div>
              </DetailCard>

              <DetailCard title={t('orderDetail.noteTitle')}>
                {isPending ? (
                  <>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder={t('orderDetail.notePlaceholder')}
                      className="text-xs"
                    />
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="secondary" onClick={saveNote} disabled={saving}>
                        {saving && <Spinner size={12} className="mr-1.5" />}
                        {t('orderDetail.updateNote')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{order.note || t('orderDetail.noNote')}</p>
                )}
              </DetailCard>

              <DetailCard title={t('orderDetail.trackingTitle')}>
                {trackedItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('orderDetail.noTracking')}</p>
                ) : (
                  <div className="space-y-4">
                    {trackedItems.map((item, i) => (
                      <div key={item.productionId ?? i} className="space-y-2">
                        {item.tracking?.number && (
                          <div>
                            <p className="text-xs font-semibold">{t('orderDetail.trackingNumber')}</p>
                            <p className="text-xs text-muted-foreground font-mono inline-flex items-center gap-1">
                              {item.tracking.number}
                              <CopyButton value={item.tracking.number} label={t('orderDetail.trackingNumber')} />
                            </p>
                          </div>
                        )}
                        {item.tracking?.carrier && (
                          <div>
                            <p className="text-xs font-semibold">{t('orderDetail.carrier')}</p>
                            <p className="text-xs text-muted-foreground">{item.tracking.carrier}</p>
                          </div>
                        )}
                        {item.tracking?.url && (
                          <div>
                            <p className="text-xs font-semibold">URL</p>
                            <a
                              href={item.tracking.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary hover:underline break-all"
                            >
                              {item.tracking.url}
                            </a>
                          </div>
                        )}
                        {item.tracking?.labelUrl && (
                          <>
                            <a
                              href={item.tracking.labelUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                              {t('orderDetail.shippingLabel')}
                            </a>
                            <iframe
                              src={item.tracking.labelUrl}
                              title={`${t('orderDetail.shippingLabel')} ${item.tracking.number ?? ''}`}
                              className="w-full min-h-[420px] rounded-md border-2 border-dashed border-border"
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </DetailCard>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
