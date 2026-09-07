'use client';

import dayjs from 'dayjs';
import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ExternalLink, Info, Loader2 } from 'lucide-react';
import type { AdminCustomerStagingOrder, CeoOverview, FactoryOverview, LifecycleOverview } from 'shared';
import { OrdersPagination } from '@/components/orders/orders-pagination';
import { ProductLineTabs, type ProductLineTabKey } from '@/components/orders/product-line-tabs';
import { ProductLineBadge, StatusBadge } from '@/components/shared/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/card';
import { CopyButton } from '@/components/shared/copy-button';
import { DateRangeFilter, type DateRange } from '@/components/shared/date-range-filter';
import { PageHeader } from '@/components/shared/page-header';
import { useApi } from '@/hooks/use-api';
import { useUrlState } from '@/hooks/use-url-state';
import { orderDisplayCode, type ApiRes } from '@/lib/customer-orders';
import { isProductLine } from '@/lib/product-lines';
import type { CustomerOrderCounts } from 'shared';

/** 8 chặng vòng đời (`LIFECYCLE_STAGE_KEYS`) — màu theo họ logo, đậm dần theo tiến trình. */
const STAGES = ['tool-check', 'designer', 'print', 'press', 'qc-post-press', 'sew-in', 'sew-out', 'pack'] as const;
const STAGE_COLORS: Record<string, string> = {
  'tool-check': '#7f9a2b', designer: '#48a05c', print: '#c9a400', press: '#e01008', 'qc-post-press': '#c40c68', 'sew-in': '#a80a58', 'sew-out': '#800808', pack: '#3a0c24',
};
const SEVERITY: Record<string, { color: string; icon: typeof Info }> = {
  critical: { color: '#c30d07', icon: AlertTriangle },
  warning: { color: '#9a7a05', icon: AlertTriangle },
  good: { color: '#3a8a4c', icon: CheckCircle2 },
  info: { color: '#5c5361', icon: Info },
};
const fmt = (n?: number | null) => (n == null ? '—' : n.toLocaleString());
const pct = (n?: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`);

function Kpi({ label, value, prev, color, hint }: { label: string; value: string; prev?: number | null; color: string; hint?: string }) {
  const up = prev != null && prev > 0;
  const down = prev != null && prev < 0;
  return (
    <div className="bg-card border border-border1 rounded-xl border-t-4 px-3 py-2" style={{ borderTopColor: color }} title={hint}>
      <div className="text-[9px] font-semibold text-text-muted uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-[17px] font-extrabold tabular-nums" style={{ color }}>{value}</div>
        {prev != null && prev !== 0 && (
          <span className={`inline-flex items-center text-[10px] font-semibold ${up ? 'text-success' : down ? 'text-error' : 'text-text-muted'}`}>
            {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(prev).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

const delta = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

export function OperationsView() {
  const { t } = useTranslation(['hub', 'ceoDashboard', 'track', 'customerPortal']);
  const [state, setState] = useUrlState({ from: '', to: '', factory: '', stage: '', line: '', page: '1' });
  const line: ProductLineTabKey = isProductLine(state.line) ? state.line : 'all';
  const page = Math.max(1, Number(state.page) || 1);
  const from = state.from || dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  const to = state.to || dayjs().format('YYYY-MM-DD');
  // Phễu/bảng: KHÔNG giới hạn ngày khi người dùng chưa chọn (hiện tồn thực tại) — CEO KPI vẫn cần kỳ → mặc định 7 ngày.
  const dateRange: DateRange = { dateFrom: state.from || null, dateTo: state.to || null };
  const factory = state.factory;
  const stage = STAGES.includes(state.stage as (typeof STAGES)[number]) ? state.stage : '';

  const lifecycleQs = useMemo(() => { const p = new URLSearchParams(); if (state.from) p.set('from', state.from); if (state.to) p.set('to', state.to); if (factory) p.set('factoryId', factory); if (line !== 'all') p.set('productLine', line); return p.toString(); }, [state.from, state.to, factory, line]);
  const { data: lifeRes, loading: lifeLoading } = useApi<ApiRes<LifecycleOverview>>(`/api/hub/v1/orders/lifecycle-overview?${lifecycleQs}`);
  const { data: ceoRes } = useApi<{ data: CeoOverview }>(`/api/hub/v1/ceo/overview?from=${from}&to=${to}`);
  const { data: factoryRes } = useApi<ApiRes<FactoryOverview>>('/api/hub/v1/orders/factory-overview');
  const ordersQs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: '15' });
    if (stage) p.set('stage', stage); else p.set('status', 'in-production');
    if (line !== 'all') p.set('productLine', line);
    return p.toString();
  }, [page, stage, line]);
  const { data: stageOrdersRes, loading: stageLoading } = useApi<ApiRes<AdminCustomerStagingOrder[]>>(`/api/hub/v1/admin/customer-orders?${ordersQs}`);
  const { data: lineCountsRes } = useApi<ApiRes<CustomerOrderCounts>>('/api/hub/v1/admin/customer-orders/counts');
  const lineCounts = useMemo(() => { const c = lineCountsRes?.data; return c ? ({ all: c.all, ...(c.byProductLine ?? {}) } as Partial<Record<ProductLineTabKey, number>>) : undefined; }, [lineCountsRes]);
  const life = lifeRes?.data;
  const ceo = ceoRes?.data;
  const fo = factoryRes?.data;
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL;
  const stageLabel = (k: string) => t(`track:progress.stages.${k}`, { defaultValue: k });
  const maxBacklog = Math.max(1, ...(life?.stages ?? []).map((s) => s.backlog + s.error + s.rework));
  const n2 = ceo?.sla.within.find((w) => w.n === 2);

  if (lifeLoading && !life) return <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-accent" /></div>;

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('hub:ops.title')}
        subtitle={t('hub:ops.subtitle')}
        compact
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <select value={factory} onChange={(e) => setState({ factory: e.target.value })} className="px-2.5 py-1.5 rounded-lg border border-border1 bg-card text-[11px] font-semibold text-text-secondary outline-none focus:border-accent">
              <option value="">{t('hub:ops.factoryAll')}</option>
              {(life?.factories ?? []).map((f) => <option key={f.factoryId} value={f.factoryId}>{f.factoryName}</option>)}
            </select>
            <DateRangeFilter value={dateRange} onChange={(r) => setState({ from: r.dateFrom ?? '', to: r.dateTo ?? '' })} />
            {adminUrl && (
              <a href={`${adminUrl}/ffm/orders/workshop${factory ? `?factoryId=${factory}` : ''}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cta text-cta-foreground text-[10px] font-bold no-underline">
                {t('hub:ops.openFactoryApp')} <ExternalLink size={10} />
              </a>
            )}
          </div>
        }
      />

      {/* Tab dịch vụ — chọn 1 dòng thì phễu + bảng đơn lọc theo dòng đó (KPI/SLA/xưởng/nhân sự vẫn toàn hệ). */}
      <ProductLineTabs active={line} counts={lineCounts} onChange={(next) => setState({ line: next === 'all' ? '' : next, stage: '', page: '1' })} />

      {/* 1) KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Kpi label={t('hub:ops.kpi.in')} value={fmt(ceo?.production.in)} prev={ceo ? delta(ceo.production.in, ceo.production.prevIn) : null} color="#7f9a2b" />
        <Kpi label={t('hub:ops.kpi.out')} value={fmt(ceo?.production.out)} prev={ceo ? delta(ceo.production.out, ceo.production.prevOut) : null} color="#48a05c" />
        <Kpi label={t('hub:ops.kpi.active')} value={fmt(life?.totals.totalActive)} color="#c40c68" hint={ceo ? t('ceoDashboard:capacity.avgAge', { n: ceo.capacity.avgAgeDays ?? 0 }) : undefined} />
        <Kpi label={t('hub:ops.kpi.overdue')} value={fmt(ceo?.sla.overdue.total)} color="#e01008" />
        <Kpi label={t('hub:ops.kpi.n2')} value={pct(n2?.pct)} prev={ceo && n2?.pct != null && ceo.sla.prevN2Pct != null ? n2.pct - ceo.sla.prevN2Pct : null} color="#c9a400" hint={t('ceoDashboard:kpi.n2Hint')} />
      </div>

      {/* 2) Phễu 8 chặng */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle>{t('hub:ops.funnel.title')}</CardTitle>
            <span className="text-[10px] text-text-muted">{t('hub:ops.funnel.hint')}{life ? ` · ${t('hub:ops.funnel.cycle', { h: Math.round(life.totals.avgTotalCycleMs / 3_600_000) })}` : ''}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
            {STAGES.map((k) => {
              const s = life?.stages.find((x) => x.stage === k);
              const total = (s?.backlog ?? 0) + (s?.error ?? 0) + (s?.rework ?? 0);
              const isBottleneck = life?.totals.bottleneckStage === k;
              const active = stage === k;
              const color = STAGE_COLORS[k];
              return (
                <button key={k} type="button" onClick={() => setState({ stage: active ? '' : k, page: '1' })} className={`text-left rounded-xl border p-2.5 transition-all ${active ? 'border-accent shadow-card' : 'border-border1 hover:border-accent/60'} ${isBottleneck ? 'bg-error-bg' : 'bg-card'}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-text-primary truncate">{stageLabel(k)}</span>
                    {isBottleneck && <span className="text-[8px] font-bold uppercase text-error">{t('hub:ops.funnel.bottleneck')}</span>}
                  </div>
                  <div className="text-[20px] font-extrabold tabular-nums leading-tight" style={{ color }}>{fmt(s?.backlog)}</div>
                  <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden my-1"><div className="h-full rounded-full" style={{ width: `${(total / maxBacklog) * 100}%`, background: color }} /></div>
                  <div className="text-[9px] text-text-muted flex flex-wrap gap-x-2">
                    {(s?.error ?? 0) > 0 && <span className="text-error font-semibold">{t('hub:ops.funnel.error')} {s?.error}</span>}
                    {(s?.rework ?? 0) > 0 && <span className="text-warning font-semibold">{t('hub:ops.funnel.rework')} {s?.rework}</span>}
                    <span>{t('hub:ops.funnel.done')} {fmt(s?.doneInRange)}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 border-t border-border2 pt-3">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <p className="text-[11px] font-bold text-text-primary">
                {stage ? t('hub:ops.stageOrders.title', { stage: stageLabel(stage) }) : t('hub:ops.stageOrders.allTitle', { line: line === 'all' ? t('hub:ops.factoryAll') : t(`customerPortal:productLines.${line}`) })}
                <span className="ml-2 text-[10px] font-normal text-text-muted">{fmt(stageOrdersRes?.total)}</span>
              </p>
              <Link href={`/hub/orders${line !== 'all' ? `/${line}` : ''}?status=in-production`} prefetch={false} className="text-[10px] text-accent hover:underline">{t('hub:ops.stageOrders.openAll')}</Link>
            </div>
            {stageLoading && !stageOrdersRes ? <Loader2 size={14} className="animate-spin text-accent" /> : (stageOrdersRes?.data ?? []).length === 0 ? (
              <p className="text-[11px] text-text-muted">{t('hub:ops.stageOrders.empty')}</p>
            ) : (
              <div className={`overflow-x-auto ${stageLoading ? 'opacity-60' : ''}`}>
                <table className="w-full text-[11px] min-w-[820px]">
                  <thead className="bg-surface-muted"><tr className="text-[9px] uppercase tracking-wider text-text-muted">
                    <th className="py-1.5 px-2 text-left font-semibold">{t('customerPortal:orders.columns.order')}</th>
                    <th className="py-1.5 px-2 text-left font-semibold">{t('hub:orders.columns.seller')}</th>
                    <th className="py-1.5 px-2 text-left font-semibold">{t('customerPortal:orders.columns.product')}</th>
                    <th className="py-1.5 px-2 text-left font-semibold">{t('hub:orders.columns.service')}</th>
                    <th className="py-1.5 px-2 text-left font-semibold">{t('hub:ops.stageOrders.stageCol')}</th>
                    <th className="py-1.5 px-2 text-left font-semibold">{t('customerPortal:orders.columns.status')}</th>
                    <th className="py-1.5 px-2 text-right font-semibold">{t('hub:ops.stageOrders.ageCol')}</th>
                  </tr></thead>
                  <tbody>
                    {(stageOrdersRes?.data ?? []).map((o) => {
                      const code = orderDisplayCode(o); const first = o.items[0];
                      const k = first?.currentStageKey; const color = k ? STAGE_COLORS[k] ?? '#5c5361' : '#5c5361';
                      return (
                        <tr key={o._id} className="border-t border-border2 hover:bg-card-hover">
                          <td className="py-1.5 px-2 font-mono font-bold whitespace-nowrap">#{code} <CopyButton text={code} size={10} /></td>
                          <td className="py-1.5 px-2">{o.customer?.userSku || '—'}</td>
                          <td className="py-1.5 px-2 truncate max-w-[240px]">{first?.type || first?.sku || '—'}<span className="text-text-muted"> · {[first?.color, first?.size].filter(Boolean).join('/')}</span></td>
                          <td className="py-1.5 px-2">{(o.productLines ?? []).map((l) => <ProductLineBadge key={l} line={l} compact />)}</td>
                          <td className="py-1.5 px-2">
                            {k ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-white" style={{ background: color }}>{stageLabel(k)}</span> : <span className="text-text-muted">—</span>}
                            {(o.held || o.rework) && <span className="ml-1 text-[9px] font-semibold text-warning">{o.held ? t('customerPortal:orders.badgeHold') : t('customerPortal:orders.badgeRework')}</span>}
                          </td>
                          <td className="py-1.5 px-2"><StatusBadge status={o.status} /></td>
                          <td className="py-1.5 px-2 text-right text-text-muted whitespace-nowrap">{first?.currentStageAt ? t('hub:ops.stageOrders.age', { n: dayjs().diff(dayjs(first.currentStageAt), 'day') }) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(stageOrdersRes?.total ?? 0) > 15 && (
                  <OrdersPagination page={page} limit={15} pages={Math.max(1, Math.ceil((stageOrdersRes?.total ?? 0) / 15))} total={stageOrdersRes?.total ?? 0} onChange={(n) => { if (n.page) setState({ page: String(n.page) }); }} />
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3) SLA + theo xưởng */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle>{t('hub:ops.sla.title')}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(ceo?.sla.within ?? []).map((w) => {
                const target = ceo?.sla.targets.find((x) => x.n === w.n)?.pct ?? 0;
                const ok = (w.pct ?? 0) >= target;
                return (
                  <div key={w.n} className="grid grid-cols-[70px_1fr_110px] items-center gap-2 text-[11px]">
                    <span className="text-text-secondary">{t('ceoDashboard:sla.within', { n: w.n })}</span>
                    <span className="h-2.5 rounded-full bg-surface-muted overflow-hidden relative">
                      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, w.pct ?? 0)}%`, background: ok ? '#48a05c' : '#e01008' }} />
                      <span className="absolute top-0 bottom-0 w-px bg-text-muted" style={{ left: `${target}%` }} />
                    </span>
                    <span className="text-right tabular-nums"><b style={{ color: ok ? '#3a8a4c' : '#c30d07' }}>{pct(w.pct)}</b> <span className="text-text-muted">/ {target}%</span></span>
                  </div>
                );
              })}
              {ceo && <p className="text-[10px] text-text-muted">{t('ceoDashboard:sla.cohortRange', { from: ceo.sla.cohortFrom, to: ceo.sla.cohortTo })} · {t('ceoDashboard:sla.mature', { n: ceo.sla.mature })}</p>}
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-1">{t('hub:ops.sla.overdueByFactory')}</p>
                <ul className="space-y-1">
                  {(ceo?.sla.overdue.byFactory ?? []).map((f) => (
                    <li key={f.factoryId} className="flex items-center justify-between text-[11px]"><span>{f.shortName ?? f.factoryId}</span><b className="tabular-nums text-error">{fmt(f.count)}</b></li>
                  ))}
                  {(ceo?.sla.overdue.byFactory ?? []).length === 0 && <li className="text-[11px] text-text-muted">{t('ceoDashboard:sla.none')}</li>}
                </ul>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-1">{t('hub:ops.sla.oldest')}</p>
                <ul className="space-y-1">
                  {(ceo?.sla.overdue.sample ?? []).slice(0, 6).map((o) => (
                    <li key={o.productionId} className="flex items-center justify-between gap-2 text-[10.5px]">
                      <span className="font-mono font-semibold truncate">{o.productionId}</span>
                      <span className="text-text-muted truncate">{o.userSku} · {o.factory} · {stageLabel(o.stage)}</span>
                      <b className="tabular-nums text-error whitespace-nowrap">{t('ceoDashboard:sla.age', { n: o.ageDays })}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('hub:ops.factory.title')}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-surface-muted"><tr className="text-[9px] uppercase tracking-wider text-text-muted">
                  <th className="py-1.5 px-2 text-left font-semibold">{t('ceoDashboard:capacity.cols.factory')}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{t('ceoDashboard:capacity.cols.in')}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{t('ceoDashboard:capacity.cols.out')}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{t('ceoDashboard:capacity.cols.backlog')}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{t('ceoDashboard:capacity.cols.perDay')}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{t('ceoDashboard:capacity.cols.clear')}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{t('ceoDashboard:capacity.cols.n2')}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{t('ceoDashboard:capacity.cols.errors')}</th>
                </tr></thead>
                <tbody>
                  {(ceo?.production.byFactory ?? []).map((f) => (
                    <tr key={f.factoryId} className="border-t border-border2">
                      <td className="py-1.5 px-2 font-semibold">{f.shortName ?? f.name}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(f.in)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(f.out)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmt(f.backlog)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{f.outPerDay.toFixed(0)}</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums ${f.daysToClear != null && f.daysToClear > 3 ? 'text-error font-semibold' : ''}`}>{f.daysToClear == null ? '—' : t('ceoDashboard:capacity.days', { n: f.daysToClear.toFixed(1) })}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{pct(f.n2Pct)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-error">{fmt(f.errored)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fo && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[10.5px]">
                  <thead><tr className="text-[9px] uppercase tracking-wider text-text-muted">
                    <th className="py-1 px-2 text-left font-semibold">{t('hub:ops.factory.cols.factory')}</th>
                    <th className="py-1 px-2 text-right font-semibold">{t('hub:ops.factory.cols.printed')}</th>
                    <th className="py-1 px-2 text-right font-semibold">{t('hub:ops.factory.cols.printing')}</th>
                    <th className="py-1 px-2 text-right font-semibold">{t('hub:ops.factory.cols.notPrinted')}</th>
                    <th className="py-1 px-2 text-right font-semibold">{t('hub:ops.factory.cols.designUnassigned')}</th>
                    <th className="py-1 px-2 text-right font-semibold">{t('hub:ops.factory.cols.errors')}</th>
                  </tr></thead>
                  <tbody>
                    {fo.factories.map((f) => (
                      <tr key={f.factoryId} className="border-t border-border2">
                        <td className="py-1 px-2 text-text-secondary">{f.factoryName}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{fmt(f.printedCount)}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{fmt(f.printingCount)}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{fmt(f.notPrintedCount)}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{fmt(f.designUnassignedCount)}</td>
                        <td className="py-1 px-2 text-right tabular-nums text-error">{fmt(f.errorCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4) Chất lượng + nhân sự */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle>{t('ceoDashboard:quality.title')}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-[11px] text-text-secondary mb-2">{t('ceoDashboard:kpi.errorRate')}: <b className="text-error">{pct(ceo?.quality.ratePct)}</b> · {fmt(ceo?.quality.errored)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-1">{t('ceoDashboard:quality.bySource')}</p>
                {(ceo?.quality.bySource ?? []).map((s) => <div key={s.source} className="flex justify-between text-[11px]"><span>{s.source}</span><b className="tabular-nums">{fmt(s.count)}</b></div>)}
                {(ceo?.quality.bySource ?? []).length === 0 && <p className="text-[11px] text-text-muted">{t('ceoDashboard:quality.none')}</p>}
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-1">{t('ceoDashboard:quality.topTypes')}</p>
                {(ceo?.quality.topTypes ?? []).slice(0, 6).map((x) => <div key={x.type} className="flex justify-between gap-2 text-[11px]"><span className="truncate">{x.type}</span><b className="tabular-nums whitespace-nowrap">{t('ceoDashboard:quality.ofTotal', { count: x.count, total: x.total })}</b></div>)}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('ceoDashboard:people.title')}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-1">{t('ceoDashboard:people.designers')}</p>
                <table className="w-full text-[11px]"><thead><tr className="text-[9px] uppercase text-text-muted"><th className="text-left font-semibold">{t('ceoDashboard:people.cols.name')}</th><th className="text-right font-semibold">{t('ceoDashboard:people.cols.done')}</th><th className="text-right font-semibold">{t('ceoDashboard:people.cols.backlog')}</th><th className="text-right font-semibold">{t('ceoDashboard:people.cols.rework')}</th></tr></thead>
                  <tbody>{(ceo?.people.designers ?? []).slice(0, 8).map((d) => <tr key={d.userId} className="border-t border-border2"><td className="py-1">{d.name}</td><td className="py-1 text-right tabular-nums">{d.done}</td><td className={`py-1 text-right tabular-nums ${d.backlog >= 30 ? 'text-error font-semibold' : ''}`}>{d.backlog}</td><td className="py-1 text-right tabular-nums text-warning">{d.rework}</td></tr>)}</tbody></table>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-1">{t('ceoDashboard:people.workers')}</p>
                <table className="w-full text-[11px]"><thead><tr className="text-[9px] uppercase text-text-muted"><th className="text-left font-semibold">{t('ceoDashboard:people.cols.name')}</th><th className="text-left font-semibold">{t('ceoDashboard:people.cols.stage')}</th><th className="text-right font-semibold">{t('ceoDashboard:people.cols.done')}</th></tr></thead>
                  <tbody>{(ceo?.people.workers ?? []).slice(0, 8).map((w) => <tr key={w.userId + w.stage} className="border-t border-border2"><td className="py-1">{w.name}</td><td className="py-1 text-text-muted">{stageLabel(w.stage)}</td><td className="py-1 text-right tabular-nums">{w.done}</td></tr>)}</tbody></table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 5) Phát hiện & việc cần làm */}
      <Card>
        <CardHeader><CardTitle>{t('hub:ops.findings.title')}</CardTitle></CardHeader>
        <CardContent>
          {(ceo?.findings ?? []).length === 0 ? (
            <p className="text-[11px] text-text-muted">{t('hub:ops.findings.empty')}</p>
          ) : (
            <ul className="space-y-1.5">
              {(ceo?.findings ?? []).map((f, i) => {
                const sev = SEVERITY[f.severity] ?? SEVERITY.info; const Icon = sev.icon;
                return (
                  <li key={i} className="flex items-start gap-2 text-[11px]">
                    <Icon size={13} className="mt-0.5 shrink-0" style={{ color: sev.color }} />
                    <div>
                      <p className="text-text-primary">{t(`ceoDashboard:findings.${f.code}`, { ...f.params, defaultValue: f.code })}</p>
                      {f.action && <p className="text-[10px] text-accent">→ {t(`ceoDashboard:actions.${f.action}`, { ...f.params, defaultValue: f.action })}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
