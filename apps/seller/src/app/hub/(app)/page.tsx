'use client';

import dayjs from 'dayjs';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Factory, Package, PauseCircle, Users } from 'lucide-react';
import { CUSTOMER_ORDER_STATUSES } from 'shared/enums';
import type { AdminCustomerOrderStats, CustomerOrderCounts } from 'shared';
import { ViewAsButton } from '@/components/hub/view-as-button';
import { ProductLineBadge, StatusBadge } from '@/components/shared/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/card';
import { PageHeader } from '@/components/shared/page-header';
import { useApi } from '@/hooks/use-api';
import { STATUS_COLORS } from '@/lib/constants';
import { orderDisplayCode, type ApiRes } from '@/lib/customer-orders';
import { PRODUCT_LINES, PRODUCT_LINE_META } from '@/lib/product-lines';

const COUNT_KEY: Record<string, keyof CustomerOrderCounts> = { pending: 'pending', processing: 'processing', 'in-production': 'inProduction', fulfilled: 'fulfilled', completed: 'completed', refunded: 'refunded', cancelled: 'cancelled' };

function Stat({ label, value, icon, color, href }: { label: string; value: number; icon: React.ReactNode; color: string; href: string }) {
  return (
    <Link href={href} prefetch={false} className="rounded-xl border border-border1 bg-card p-4 flex items-center gap-3 hover:border-accent no-underline">
      <div className="rounded-lg p-2.5" style={{ background: `${color}15`, color }}>{icon}</div>
      <div><p className="text-2xl font-extrabold leading-tight text-text-primary tabular-nums">{value.toLocaleString()}</p><p className="text-[11px] text-text-muted">{label}</p></div>
    </Link>
  );
}
function Bars({ rows }: { rows: { key: string; label: React.ReactNode; value: number; color: string; href: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Link key={r.key} href={r.href} prefetch={false} className="grid grid-cols-[130px_1fr_64px] items-center gap-2 no-underline group">
          <span className="text-[11px] text-text-secondary truncate group-hover:text-text-primary">{r.label}</span>
          <span className="h-2.5 rounded-full bg-surface-muted overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></span>
          <span className="text-[11px] font-semibold text-text-primary tabular-nums text-right">{r.value.toLocaleString()}</span>
        </Link>
      ))}
    </div>
  );
}

export default function HubDashboardPage() {
  const { t } = useTranslation(['hub', 'customerPortal']);
  const { data, loading } = useApi<ApiRes<AdminCustomerOrderStats>>('/api/hub/v1/admin/customer-orders/stats');
  const s = data?.data;
  if (loading && !s) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  const c = s?.counts;
  return (
    <div className="space-y-4">
      <PageHeader title={t('hub:dashboard.title')} subtitle={t('hub:dashboard.subtitle')} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label={t('hub:dashboard.sellers')} value={s?.sellers ?? 0} icon={<Users size={18} />} color="#6f26c2" href="/hub/sellers" />
        <Stat label={t('hub:dashboard.orders')} value={c?.all ?? 0} icon={<Package size={18} />} color="#312e81" href="/hub/orders" />
        <Stat label={t('hub:dashboard.pending')} value={c?.pending ?? 0} icon={<Package size={18} />} color="#a16207" href="/hub/orders?status=pending" />
        <Stat label={t('hub:dashboard.inProduction')} value={c?.inProduction ?? 0} icon={<Factory size={18} />} color="#4338ca" href="/hub/orders?status=in-production" />
        <Stat label={t('hub:dashboard.held')} value={c?.held ?? 0} icon={<PauseCircle size={18} />} color="#c2410c" href="/hub/orders?held=1" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle>{t('hub:dashboard.byProductLine')}</CardTitle></CardHeader><CardContent>
          <Bars rows={PRODUCT_LINES.map((l) => ({ key: l, label: <span className="inline-flex items-center gap-1.5"><ProductLineBadge line={l} compact />{t(`customerPortal:productLines.${l}`)}</span>, value: c?.byProductLine?.[l] ?? 0, color: PRODUCT_LINE_META[l].color, href: `/hub/orders?line=${l}` }))} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{t('hub:dashboard.byStatus')}</CardTitle></CardHeader><CardContent>
          <Bars rows={CUSTOMER_ORDER_STATUSES.map((st) => ({ key: st, label: t(`customerPortal:orders.status.${st}`), value: (c?.[COUNT_KEY[st]] as number | undefined) ?? 0, color: STATUS_COLORS[st] ?? '#6b7280', href: `/hub/orders?status=${st}` }))} />
        </CardContent></Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>{t('hub:dashboard.topSellers')}</CardTitle><Link href="/hub/sellers" prefetch={false} className="text-xs text-accent hover:underline">{t('hub:dashboard.viewAll')}</Link></div></CardHeader><CardContent>
          <table className="w-full text-xs">
            <tbody>
              {(s?.topSellers ?? []).map((r) => (
                <tr key={r.customerId} className="border-t border-border2 first:border-0">
                  <td className="py-2 pr-2"><Link href={`/hub/orders?seller=${r.customerId}`} prefetch={false} className="font-semibold text-text-primary hover:text-accent">{r.userSku || r.userEmail}</Link><p className="text-[10px] text-text-muted truncate max-w-[220px]">{r.fullName || r.userEmail}{r.tier != null ? ` · VIP ${r.tier}` : ''}</p></td>
                  <td className="py-2 pr-2 text-right tabular-nums font-bold">{r.orders.toLocaleString()}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-warning">{r.pending}</td>
                  <td className="py-2 pr-2 text-right tabular-nums" style={{ color: '#4338ca' }}>{r.inProduction}</td>
                  <td className="py-2 text-right"><ViewAsButton customerId={r.customerId} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
        <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>{t('hub:dashboard.recent')}</CardTitle><Link href="/hub/orders" prefetch={false} className="text-xs text-accent hover:underline">{t('hub:dashboard.viewAll')}</Link></div></CardHeader><CardContent>
          <ul className="divide-y divide-border2">
            {(s?.recent ?? []).map((o) => (
              <li key={o._id} className="py-2 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0"><p className="font-mono font-semibold text-text-primary">#{orderDisplayCode(o)}</p><p className="text-[10px] text-text-muted truncate">{o.customer?.userSku || o.customer?.userEmail} · {dayjs(o.pushedAt ?? o.createdAt).format('DD/MM HH:mm')}</p></div>
                <div className="flex items-center gap-1 shrink-0">{(o.productLines ?? []).map((l) => <ProductLineBadge key={l} line={l} compact />)}<StatusBadge status={o.status} /></div>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      </div>
    </div>
  );
}
