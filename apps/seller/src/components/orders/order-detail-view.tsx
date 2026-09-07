'use client';

import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink, Image as ImageIcon } from 'lucide-react';
import type { CustomerOrderSummary, LifecycleTrack } from 'shared';
import { StageTimeline } from '@/components/orders/stage-timeline';
import { ProductLineBadge, StatusBadge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/card';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { SafeImage } from '@/components/shared/safe-image';
import { useToast } from '@/components/shared/toast';
import { apiFetch, useApi } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';
import { driveThumbnailUrl, driveViewUrl } from '@/lib/label-preview';
import { productLineHref } from '@/lib/product-lines';

const ADDRESS_FIELDS = ['firstName', 'lastName', 'company', 'phone', 'email', 'address1', 'address2', 'city', 'state', 'postcode', 'country'] as const;
type AddressField = (typeof ADDRESS_FIELDS)[number];
type Address = Partial<Record<AddressField, string>>;

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-text-muted font-semibold">{label}</p>
      <p className="text-xs text-text-primary break-words">{value}</p>
    </div>
  );
}

const dt = (v?: string | Date) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : undefined);

export function OrderDetailView({ productionId }: { productionId: string }) {
  const { t } = useTranslation(['seller', 'customerPortal', 'track']);
  const { toast } = useToast();
  const url = `/api/v1/customer/orders/${encodeURIComponent(productionId)}`;
  const { data, loading, error, refetch } = useApi<ApiRes<{ order: CustomerOrderSummary; track: LifecycleTrack }>>(url);
  const order = data?.data.order;
  const track = data?.data.track;

  const [mockupUrl, setMockupUrl] = useState('');
  const [address, setAddress] = useState<Address>({});
  const [editAddress, setEditAddress] = useState(false);
  const [saving, setSaving] = useState(false);

  // Đồng bộ form khi `order` đổi (load xong / refetch) — khuôn React "adjust state while rendering".
  const [syncedOrder, setSyncedOrder] = useState<CustomerOrderSummary | undefined>(undefined);
  if (order && order !== syncedOrder) {
    setSyncedOrder(order);
    setMockupUrl(order.mockupUrl ?? '');
    setAddress((order.shippingAddress ?? {}) as Address);
  }

  const cancelled = !!order?.cancelledAt;

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await apiFetch(url, { method: 'PATCH', body: JSON.stringify(patch) });
      toast('success', t('seller:detail.saved'));
      setEditAddress(false);
      refetch();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error || !order) {
    return (
      <EmptyState
        title={t('seller:detail.notFound')}
        action={
          <Link href="/portal" prefetch={false} className="text-accent text-sm hover:underline">
            {t('seller:detail.back')}
          </Link>
        }
      />
    );
  }

  const publicLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/track/${encodeURIComponent(order.productionId)}`;
  const backHref = order.productLine ? productLineHref(order.productLine) : '/portal';
  const thumb = order.mockupUrl ? (driveThumbnailUrl(order.mockupUrl, 400) ?? order.mockupUrl) : null;
  const designs = Object.entries(order.designs ?? {}).filter(([, v]) => !!v) as [string, string][];

  return (
    <div className="space-y-4">
      <Link href={backHref} prefetch={false} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
        <ArrowLeft size={13} /> {t('seller:detail.back')}
      </Link>
      <PageHeader
        title={`#${order.productionId}`}
        subtitle={[order.type, [order.color, order.size].filter(Boolean).join('/'), order.quantity ? `×${order.quantity}` : ''].filter(Boolean).join(' · ')}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <ProductLineBadge line={order.productLine} />
            <StatusBadge status={order.cancelledAt ? 'cancelled' : track?.completed ? 'completed' : track?.currentStageKey ? 'in-production' : 'pending'} />
            <CopyButton text={order.productionId} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('seller:detail.productionTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {track && track.stages.length > 0 && order.inProductionAt ? (
                <StageTimeline stages={track.stages} />
              ) : (
                <p className="text-xs text-text-muted">{t('seller:detail.notStarted')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('seller:detail.designsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {designs.length === 0 ? (
                <p className="text-xs text-text-muted">{t('track:designs.empty')}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {designs.map(([key, link]) => (
                    <a key={key} href={driveViewUrl(link)} target="_blank" rel="noreferrer" className="block rounded-lg border border-border1 overflow-hidden hover:border-accent">
                      <SafeImage
                        src={driveThumbnailUrl(link, 300) ?? link}
                        alt={key}
                        className="w-full aspect-square object-contain bg-surface-muted"
                        fallback={<div className="w-full aspect-square flex items-center justify-center text-text-muted bg-surface-muted"><ImageIcon size={18} /></div>}
                      />
                      <p className="px-2 py-1 text-[10px] font-semibold text-text-secondary truncate flex items-center gap-1">
                        {key} <ExternalLink size={9} />
                      </p>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('seller:detail.infoTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                <Field label={t('track:dates.orderAt')} value={dt(order.orderAt ?? order.createdAt)} />
                <Field label={t('track:dates.inProductionAt')} value={dt(order.inProductionAt)} />
                <Field
                  label={t('track:status.currentStage')}
                  value={track?.currentStageKey ? t(`track:progress.stages.${track.currentStageKey}`, { defaultValue: order.currentStageLabel ?? '' }) : track?.completed ? t('track:status.completed') : order.currentStageLabel}
                />
                <Field label={t('track:dates.cancelledAt')} value={dt(order.cancelledAt)} />
                {order.cancelReason && <Field label={t('customerPortal:orderDetail.noteTitle')} value={order.cancelReason} />}
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-text-muted font-semibold">{t('seller:detail.publicLink')}</p>
                  <p className="text-[11px] text-accent break-all inline-flex items-center gap-1">
                    <a href={publicLink} target="_blank" rel="noreferrer" className="hover:underline">/track/{order.productionId}</a>
                    <CopyButton text={publicLink} size={11} />
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('seller:detail.mockup')}</CardTitle>
            </CardHeader>
            <CardContent>
              <SafeImage
                src={thumb}
                alt=""
                className="w-full max-h-56 object-contain rounded-lg border border-border1 bg-surface-muted mb-2"
                fallback={<div className="w-full h-28 rounded-lg border border-dashed border-border1 flex items-center justify-center text-text-muted mb-2"><ImageIcon size={18} /></div>}
              />
              {!cancelled && (
                <div className="flex gap-2">
                  <input
                    value={mockupUrl}
                    onChange={(e) => setMockupUrl(e.target.value)}
                    placeholder={t('seller:detail.mockupUrl')}
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-border1 bg-card text-xs outline-none focus:border-accent"
                  />
                  <Button size="sm" variant="primary" loading={saving} disabled={mockupUrl === (order.mockupUrl ?? '')} onClick={() => save({ mockupUrl })}>
                    {t('seller:detail.save')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('seller:detail.addressTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {editAddress ? (
                <div className="space-y-2">
                  {ADDRESS_FIELDS.map((f) => (
                    <input
                      key={f}
                      value={address[f] ?? ''}
                      onChange={(e) => setAddress((a) => ({ ...a, [f]: e.target.value }))}
                      placeholder={t(`customerPortal:orderNew.shipping${f[0].toUpperCase()}${f.slice(1)}`, { defaultValue: f })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border1 bg-card text-xs outline-none focus:border-accent"
                    />
                  ))}
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setEditAddress(false)}>{t('seller:detail.cancel')}</Button>
                    <Button size="sm" variant="primary" loading={saving} onClick={() => save({ shippingAddress: address })}>{t('seller:detail.save')}</Button>
                  </div>
                </div>
              ) : order.shippingAddress ? (
                <div className="text-xs leading-5 text-text-primary">
                  <p className="font-semibold">{[order.shippingAddress.firstName, order.shippingAddress.lastName].filter(Boolean).join(' ')}</p>
                  <p>{[order.shippingAddress.address1, order.shippingAddress.address2].filter(Boolean).join(', ')}</p>
                  <p>{[order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.postcode].filter(Boolean).join(', ')}</p>
                  <p>{order.shippingAddress.country}</p>
                  <p className="text-text-muted">{[order.shippingAddress.phone, order.shippingAddress.email].filter(Boolean).join(' · ')}</p>
                  {!cancelled && (
                    <button type="button" onClick={() => setEditAddress(true)} className="mt-2 text-accent text-[11px] hover:underline">
                      {t('seller:detail.editAddress')}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-xs text-text-muted">{t('seller:detail.noAddress')}</p>
                  {!cancelled && (
                    <button type="button" onClick={() => setEditAddress(true)} className="mt-2 text-accent text-[11px] hover:underline">
                      {t('seller:detail.editAddress')}
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
