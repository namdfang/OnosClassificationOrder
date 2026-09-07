'use client';

import dayjs from 'dayjs';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ClipboardList, Factory, FileUp, PackagePlus, XCircle } from 'lucide-react';
import { CUSTOMER_ORDER_STATUSES } from 'shared/enums';
import type { CustomerDashboard, CustomerOrderCounts } from 'shared';
import { ProductLineBadge, StatusBadge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/card';
import { CopyButton } from '@/components/shared/copy-button';
import { PageHeader } from '@/components/shared/page-header';
import { useApi } from '@/hooks/use-api';
import { STATUS_COLORS } from '@/lib/constants';
import type { ApiRes } from '@/lib/customer-orders';
import { PRODUCT_LINES, PRODUCT_LINE_META } from '@/lib/product-lines';

const COUNT_KEY: Record<string, keyof CustomerOrderCounts> = {
  pending: 'pending',
  processing: 'processing',
  'in-production': 'inProduction',
  fulfilled: 'fulfilled',
  completed: 'completed',
  refunded: 'refunded',
  cancelled: 'cancelled',
};

function StatCard({ label, value, icon, color, href }: { label: string; value: number; icon: React.ReactNode; color: string; href: string }) {
  return (
    <Link href={href} prefetch={false} className="rounded-xl border border-border1 bg-card p-4 flex items-center gap-3 hover:border-accent transition-colors no-underline">
      <div className="rounded-lg p-2.5" style={{ background: `${color}15`, color }}>{icon}</div>
      <div>
        <p className="text-2xl font-extrabold leading-tight text-text-primary tabular-nums">{value.toLocaleString()}</p>
        <p className="text-[11px] text-text-muted">{label}</p>
      </div>
    </Link>
  );
}

/** Thanh ngang CSS (không cần recharts) — nhãn + số + tỉ lệ. */
function Bars({ rows }: { rows: { key: string; label: React.ReactNode; value: number; color: string; href: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Link key={r.key} href={r.href} prefetch={false} className="grid grid-cols-[130px_1fr_56px] items-center gap-2 no-underline group">
          <span className="text-[11px] text-text-secondary truncate group-hover:text-text-primary">{r.label}</span>
          <span className="h-2.5 rounded-full bg-surface-muted overflow-hidden">
            <span className="block h-full rounded-full transition-all" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </span>
          <span className="text-[11px] font-semibold text-text-primary tabular-nums text-right">{r.value.toLocaleString()}</span>
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation(['customerPortal', 'seller']);
  const { data: dashRes, loading } = useApi<ApiRes<CustomerDashboard>>('/api/v1/customer/orders/dashboard');
  const { data: countsRes } = useApi<ApiRes<CustomerOrderCounts>>('/api/v1/customer/orders/counts');
  const totals = dashRes?.data.totals ?? { total: 0, processing: 0, completed: 0, cancelled: 0 };
  const recent = dashRes?.data.recentOrders ?? [];
  const counts = countsRes?.data;

  if (loading && !dashRes) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('customerPortal:dashboard.title')}
        subtitle={t('customerPortal:dashboard.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/portal/orders/import" prefetch={false}><Button variant="secondary" size="sm"><FileUp size={13} className="mr-1.5" />{t('customerPortal:orders.importCsv')}</Button></Link>
            <Link href="/portal/orders/create" prefetch={false}><Button variant="primary" size="sm"><PackagePlus size={13} className="mr-1.5" />{t('customerPortal:layout.newOrder')}</Button></Link>
          </div>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t('customerPortal:dashboard.totalOrders')} value={counts?.all ?? totals.total} icon={<ClipboardList size={18} />} color="#312e81" href="/portal/orders" />
        <StatCard label={t('customerPortal:dashboard.processingOrders')} value={counts?.inProduction ?? totals.processing} icon={<Factory size={18} />} color="#4338ca" href="/portal/orders?status=in-production" />
        <StatCard label={t('customerPortal:dashboard.completedOrders')} value={(counts?.fulfilled ?? 0) + (counts?.completed ?? 0) || totals.completed} icon={<CheckCircle2 size={18} />} color="#15803d" href="/portal/orders?status=completed" />
        <StatCard label={t('customerPortal:dashboard.cancelledOrders')} value={counts?.cancelled ?? totals.cancelled} icon={<XCircle size={18} />} color="#6b7280" href="/portal/orders?status=cancelled" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>{t('seller:dashboard.byProductLine')}</CardTitle></CardHeader>
          <CardContent>
            <Bars
              rows={PRODUCT_LINES.map((l) => ({
                key: l,
                label: <span className="inline-flex items-center gap-1.5"><ProductLineBadge line={l} compact />{t(`customerPortal:productLines.${l}`)}</span>,
                value: counts?.byProductLine?.[l] ?? 0,
                color: PRODUCT_LINE_META[l].color,
                href: `/portal/orders/${PRODUCT_LINE_META[l].slug}`,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('seller:dashboard.byStatus')}</CardTitle></CardHeader>
          <CardContent>
            <Bars
              rows={CUSTOMER_ORDER_STATUSES.map((s) => ({
                key: s,
                label: t(`customerPortal:orders.status.${s}`),
                value: (counts?.[COUNT_KEY[s]] as number | undefined) ?? 0,
                color: STATUS_COLORS[s] ?? '#6b7280',
                href: `/portal/orders?status=${s}`,
              }))}
            />
            {counts && (counts.held > 0 || counts.rework > 0) && (
              <p className="mt-3 text-[11px] text-text-muted">
                {t('customerPortal:orders.badgeHold')}: <b className="text-warning">{counts.held}</b> · {t('customerPortal:orders.badgeRework')}: <b style={{ color: '#b45309' }}>{counts.rework}</b>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('customerPortal:dashboard.recentOrders')}</CardTitle>
            <Link href="/portal/orders" prefetch={false} className="text-xs text-accent hover:underline">{t('customerPortal:dashboard.viewAllOrders')}</Link>
          </div>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-xs text-text-muted">{t('customerPortal:orders.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[640px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                    <th className="py-2 pr-3 font-semibold">{t('customerPortal:orders.columns.code')}</th>
                    <th className="py-2 pr-3 font-semibold">{t('customerPortal:orders.columns.product')}</th>
                    <th className="py-2 pr-3 font-semibold">{t('customerPortal:orders.columns.colorSize')}</th>
                    <th className="py-2 pr-3 font-semibold">{t('customerPortal:orders.columns.quantity')}</th>
                    <th className="py-2 pr-3 font-semibold">{t('customerPortal:orders.columns.status')}</th>
                    <th className="py-2 font-semibold">{t('customerPortal:orders.columns.orderDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o._id} className="border-t border-border2">
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1">
                          <Link href={`/portal/orders/${encodeURIComponent(o.productionId)}`} prefetch={false} className="font-mono font-semibold text-accent hover:underline">{o.productionId}</Link>
                          <CopyButton text={o.productionId} size={11} />
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-text-primary"><span className="inline-flex items-center gap-1.5"><ProductLineBadge line={o.productLine} compact />{o.type ?? '—'}</span></td>
                      <td className="py-2 pr-3 text-text-secondary">{[o.color, o.size].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{o.quantity ?? '—'}</td>
                      <td className="py-2 pr-3">
                        {o.cancelledAt ? <StatusBadge status="cancelled" /> : o.completed ? <StatusBadge status="completed" /> : o.inProductionAt ? <StatusBadge status="in-production" /> : <StatusBadge status="pending" />}
                        {o.currentStageLabel && !o.cancelledAt && !o.completed && <span className="ml-1 text-[10px] text-text-muted">{o.currentStageLabel}</span>}
                      </td>
                      <td className="py-2 text-text-secondary whitespace-nowrap">{dayjs(o.orderAt ?? o.createdAt).format('DD/MM/YYYY HH:mm')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
