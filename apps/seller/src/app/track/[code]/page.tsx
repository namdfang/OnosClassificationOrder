'use client';

import dayjs from 'dayjs';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, PauseCircle, Search, Wrench } from 'lucide-react';
import type { PublicOrderTrack } from 'shared';
import { OnosLogo } from '@/components/brand/logo';
import { StageTimeline } from '@/components/orders/stage-timeline';
import { ProductLineBadge, StatusBadge } from '@/components/shared/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/card';
import { CopyButton } from '@/components/shared/copy-button';
import { SafeImage } from '@/components/shared/safe-image';
import { useApi } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';
import { driveThumbnailUrl, driveViewUrl } from '@/lib/label-preview';

const dt = (v?: string | Date) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : undefined);

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-text-muted font-semibold">{label}</p>
      <p className="text-xs text-text-primary break-words">{value}</p>
    </div>
  );
}

export default function TrackPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { t } = useTranslation('track');
  const [input, setInput] = useState(code);
  const { data, loading, error } = useApi<ApiRes<PublicOrderTrack>>(code ? `/api/v1/public/track/${encodeURIComponent(code)}` : null);
  const d = data?.data;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border1 bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <OnosLogo title={t('meta.title')} subtitle="ONOS FACTORY" />
          <Link href="/login" prefetch={false} className="text-xs text-accent hover:underline">
            {t('signIn')}
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = input.trim();
            if (v) router.push(`/track/${encodeURIComponent(v)}`);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('search.placeholder')}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border1 bg-card text-sm font-mono outline-none focus:border-accent"
            />
          </div>
          <button type="submit" className="px-4 py-2.5 rounded-lg bg-cta text-cta-foreground text-sm font-semibold hover:bg-cta-hover">
            {t('search.submit')}
          </button>
        </form>

        {loading && !d && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {(error || (data && !d)) && !loading && (
          <Card>
            <CardContent>
              <p className="text-sm font-semibold text-text-primary font-display">{t('notFound.title')}</p>
              <p className="text-xs text-text-secondary mt-1">{t('notFound.desc')}</p>
            </CardContent>
          </Card>
        )}

        {d && (
          <>
            <Card>
              <CardContent>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-text-muted font-semibold">{t('ids.productionId')}</p>
                    <p className="font-mono text-xl font-extrabold text-text-primary inline-flex items-center gap-2">
                      {d.productionId} <CopyButton text={d.productionId} />
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ProductLineBadge line={d.product.productLine} />
                    <StatusBadge status={d.status} />
                    {d.onHold && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning"><PauseCircle size={12} />{t('status.onHold')}</span>
                    )}
                    {d.rework && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#b45309' }}><Wrench size={12} />{t('status.rework')}</span>
                    )}
                  </div>
                </div>
                {d.onHold && d.holdKind && <p className="mt-2 text-xs text-warning">{t(`hold.${d.holdKind}`)}</p>}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <Field label={t('ids.externalId')} value={d.externalId} />
                  <Field label={t('ids.orderId')} value={d.orderId} />
                  <Field label={t('ids.orderName')} value={d.orderName} />
                  <Field
                    label={t('status.currentStage')}
                    value={d.currentStageKey ? t(`progress.stages.${d.currentStageKey}`, { defaultValue: d.currentStageLabel }) : d.completed ? t('status.completed') : t('status.notStarted')}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader><CardTitle>{t('progress.title')}</CardTitle></CardHeader>
                  <CardContent>
                    {d.pushed && d.stages.length > 0 ? <StageTimeline stages={d.stages} /> : <p className="text-xs text-text-muted">{t('progress.notPushed')}</p>}
                  </CardContent>
                </Card>
                {d.designs.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>{t('designs.title')}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {d.designs.map((it) => (
                          <div key={it.key} className="rounded-lg border border-border1 overflow-hidden">
                            {it.url ? (
                              <a href={driveViewUrl(it.url)} target="_blank" rel="noreferrer">
                                <SafeImage
                                  src={driveThumbnailUrl(it.url, 300) ?? it.url}
                                  alt={it.label ?? it.key}
                                  className="w-full aspect-square object-contain bg-surface-muted"
                                  fallback={<div className="w-full aspect-square flex items-center justify-center text-[10px] text-text-muted bg-surface-muted px-2 text-center">{t('designs.unavailable')}</div>}
                                />
                              </a>
                            ) : (
                              <div className="w-full aspect-square flex items-center justify-center text-[10px] text-text-muted bg-surface-muted">{t('designs.noFile')}</div>
                            )}
                            <p className="px-2 py-1 text-[10px] font-semibold text-text-secondary truncate">
                              {it.label ?? it.key}
                              {it.isRequired === false ? ` · ${t('designs.optional')}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle>{t('product.title')}</CardTitle></CardHeader>
                  <CardContent>
                    <SafeImage
                      src={d.product.mockupUrl ? (driveThumbnailUrl(d.product.mockupUrl, 300) ?? d.product.mockupUrl) : null}
                      alt=""
                      className="w-full max-h-48 object-contain rounded-lg border border-border1 bg-surface-muted mb-3"
                      fallback={null}
                    />
                    <div className="grid grid-cols-2 gap-2.5">
                      <Field label={t('product.type')} value={d.product.type} />
                      <Field label={t('product.quantity')} value={d.product.quantity} />
                      <Field label={t('product.color')} value={d.product.color} />
                      <Field label={t('product.size')} value={d.product.size} />
                      <Field label={t('product.sku')} value={d.product.sku} />
                      <Field label={t('product.merchantSku')} value={d.product.merchantSku} />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>{t('dates.title')}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Field label={t('dates.orderAt')} value={dt(d.dates.orderAt)} />
                      <Field label={t('dates.pushedAt')} value={dt(d.dates.pushedAt)} />
                      <Field label={t('dates.inProductionAt')} value={dt(d.dates.inProductionAt)} />
                      <Field label={t('dates.fulfillmentCompletedAt')} value={dt(d.dates.fulfillmentCompletedAt)} />
                      <Field label={t('dates.cancelledAt')} value={dt(d.dates.cancelledAt)} />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>{t('shipping.title')}</CardTitle></CardHeader>
                  <CardContent>
                    {d.destination || d.tracking?.number ? (
                      <div className="space-y-2">
                        <Field label={t('shipping.destination')} value={[d.destination?.city, d.destination?.state, d.destination?.country].filter(Boolean).join(', ')} />
                        <Field label={t('shipping.carrier')} value={d.tracking?.carrier} />
                        <Field label={t('shipping.trackingNumber')} value={d.tracking?.number} />
                        {d.tracking?.url && (
                          <a href={d.tracking.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                            {t('shipping.trackingLink')} <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">{t('shipping.none')}</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {d.siblings.length > 0 && (
              <Card>
                <CardHeader><CardTitle>{t('siblings.title')}</CardTitle></CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border2">
                    {d.siblings.map((s) => (
                      <li key={s.productionId} className="py-2 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <Link href={`/track/${encodeURIComponent(s.productionId)}`} prefetch={false} className="font-mono font-semibold text-accent hover:underline">{s.productionId}</Link>
                          <p className="text-text-muted truncate">{[s.type, [s.color, s.size].filter(Boolean).join('/'), s.quantity ? `×${s.quantity}` : ''].filter(Boolean).join(' · ')}</p>
                        </div>
                        <StatusBadge status={s.status} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            <p className="text-[11px] text-text-muted text-center">{t('privacyNote')}</p>
          </>
        )}
      </main>
    </div>
  );
}
