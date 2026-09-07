'use client';

import dayjs from 'dayjs';
import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Lock, Pencil, RotateCcw, Trash2, Unlock } from 'lucide-react';
import type { CustomerAdminRow } from 'shared';
import { SimpleModal } from '@/components/hub/simple-modal';
import { ViewAsButton } from '@/components/hub/view-as-button';
import { OrdersPagination } from '@/components/orders/orders-pagination';
import { Badge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { ConfirmModal } from '@/components/shared/confirm-modal';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { SearchInput } from '@/components/shared/search-input';
import { useToast } from '@/components/shared/toast';
import { apiFetch, useApi } from '@/hooks/use-api';
import { useUrlState } from '@/hooks/use-url-state';
import type { ApiRes } from '@/lib/customer-orders';

const TIER_COLORS = ['#6b7280', '#0e7490', '#0f766e', '#4338ca', '#7c3aed', '#b45309'];
const inputCls = 'w-full px-3 py-2 rounded-lg border border-border1 bg-card text-xs text-text-primary outline-none focus:border-accent';
const selectCls = 'px-2.5 py-1.5 rounded-lg border border-border1 bg-card text-[11px] text-text-secondary outline-none focus:border-accent';

function TierBadge({ tier }: { tier?: number | null }) {
  const { t } = useTranslation('hub');
  if (tier == null) return <Badge bg="#6b728015" color="#6b7280">{t('sellers.tierNone')}</Badge>;
  const c = TIER_COLORS[tier] ?? '#6b7280';
  return <Badge bg={c + '15'} color={c}>{t('sellers.tier', { n: tier })}</Badge>;
}

function SellersContent() {
  const { t } = useTranslation('hub');
  const { toast } = useToast();
  const [state, setState] = useUrlState({ page: '1', limit: '20', q: '', tier: '', hasAccount: '', deleted: '' });
  const page = Math.max(1, Number(state.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(state.limit) || 20));
  const [searchInput, setSearchInput] = useState(state.q);
  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (state.q) p.set('search', state.q);
    if (state.tier) p.set('tier', state.tier);
    if (state.hasAccount) p.set('hasAccount', state.hasAccount);
    if (state.deleted === '1') p.set('deleted', 'true');
    return p.toString();
  }, [page, limit, state.q, state.tier, state.hasAccount, state.deleted]);
  const { data, loading, refetch } = useApi<ApiRes<CustomerAdminRow[]>>(`/api/hub/v1/customers?${query}`);
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const [edit, setEdit] = useState<CustomerAdminRow | null>(null);
  const [form, setForm] = useState({ fullName: '', phone: '', tier: '' });
  const [reset, setReset] = useState<CustomerAdminRow | null>(null);
  const [newPw, setNewPw] = useState('');
  const [generated, setGenerated] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ row: CustomerAdminRow; kind: 'lock' | 'unlock' | 'delete' } | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast('success', okMsg);
      refetch();
      return true;
    } catch (e) {
      toast('error', (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const id = (r: CustomerAdminRow) => encodeURIComponent(String(r._id));
  const name = (r: CustomerAdminRow) => r.userSku || r.userEmail || r.fullName || String(r._id);

  return (
    <div className="space-y-4">
      <PageHeader title={t('sellers.title')} subtitle={t('sellers.subtitle')} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={searchInput} onChange={(v) => { setSearchInput(v); setState({ q: v, page: '1' }); }} placeholder={t('sellers.search')} className="w-72" />
        <select value={state.tier} onChange={(e) => setState({ tier: e.target.value, page: '1' })} className={selectCls}>
          <option value="">{t('sellers.tierAll')}</option>
          <option value="none">{t('sellers.tierNone')}</option>
          {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{t('sellers.tier', { n })}</option>)}
        </select>
        <select value={state.hasAccount} onChange={(e) => setState({ hasAccount: e.target.value, page: '1' })} className={selectCls}>
          <option value="">{t('sellers.hasAccountAll')}</option>
          <option value="true">{t('sellers.hasAccountYes')}</option>
          <option value="false">{t('sellers.hasAccountNo')}</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer"><input type="checkbox" checked={state.deleted === '1'} onChange={(e) => setState({ deleted: e.target.checked ? '1' : '', page: '1' })} className="accent-[var(--color-accent)]" />{t('sellers.showDeleted')}</label>
        <span className="ml-auto text-[11px] text-text-muted tabular-nums">{total.toLocaleString()}</span>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : rows.length === 0 ? (
        <EmptyState title={t('sellers.empty')} />
      ) : (
        <div className={`bg-card border border-border1 rounded-xl overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-left min-w-[860px]">
            <thead><tr className="text-[10px] uppercase tracking-wider text-text-muted">
              <th className="px-3 py-2.5 font-semibold">{t('sellers.columns.seller')}</th>
              <th className="px-3 py-2.5 font-semibold">{t('sellers.columns.tier')}</th>
              <th className="px-3 py-2.5 font-semibold text-right">{t('sellers.columns.orders')}</th>
              <th className="px-3 py-2.5 font-semibold">{t('sellers.columns.lastOrder')}</th>
              <th className="px-3 py-2.5 font-semibold">{t('sellers.columns.status')}</th>
              <th className="px-3 py-2.5" />
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const isDeleted = !!r.deletedAt;
                const locked = r.status != null && String(r.status) === '0';
                return (
                  <tr key={String(r._id)} className={`border-t border-border2 hover:bg-card-hover ${isDeleted ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-semibold text-text-primary inline-flex items-center gap-1">{r.userSku || '—'} <CopyButton text={r.userSku || ''} size={11} /></p>
                      <p className="text-[10px] text-text-muted">{r.userEmail}{r.fullName ? ` · ${r.fullName}` : ''}{r.phone ? ` · ${r.phone}` : ''}</p>
                    </td>
                    <td className="px-3 py-2.5"><TierBadge tier={r.tier} /></td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums"><Link href={`/hub/orders?seller=${String(r._id)}`} prefetch={false} className="text-accent hover:underline font-semibold">{(r.orderCount ?? 0).toLocaleString()}</Link></td>
                    <td className="px-3 py-2.5 text-[11px] text-text-secondary whitespace-nowrap">{r.lastOrderAt ? dayjs(r.lastOrderAt).format('DD/MM/YYYY') : '—'}</td>
                    <td className="px-3 py-2.5">
                      {isDeleted ? <Badge bg="#6b728015" color="#6b7280">{t('sellers.deleted')}</Badge> : locked ? <Badge bg="#b91c1c15" color="#b91c1c">{t('sellers.locked')}</Badge> : <Badge bg="#15803d15" color="#15803d">{t('sellers.active')}</Badge>}
                      {r.hasAccount === false && <span className="ml-1 text-[10px] text-text-muted">{t('sellers.noAccount')}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {!isDeleted && <ViewAsButton customerId={String(r._id)} />}
                        {!isDeleted && <button type="button" title={t('sellers.edit')} onClick={() => { setEdit(r); setForm({ fullName: r.fullName ?? '', phone: r.phone ?? '', tier: r.tier == null ? '' : String(r.tier) }); }} className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent-light"><Pencil size={13} /></button>}
                        {!isDeleted && <button type="button" title={t('sellers.resetPassword')} onClick={() => { setReset(r); setNewPw(''); setGenerated(null); }} className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent-light"><KeyRound size={13} /></button>}
                        {!isDeleted && (locked
                          ? <button type="button" title={t('sellers.unlock')} onClick={() => setConfirm({ row: r, kind: 'unlock' })} className="p-1.5 rounded-md text-text-muted hover:text-success"><Unlock size={13} /></button>
                          : <button type="button" title={t('sellers.lock')} onClick={() => setConfirm({ row: r, kind: 'lock' })} className="p-1.5 rounded-md text-text-muted hover:text-warning"><Lock size={13} /></button>)}
                        {isDeleted
                          ? <button type="button" title={t('sellers.restore')} onClick={() => void call(() => apiFetch(`/api/hub/v1/customers/${id(r)}/restore`, { method: 'POST', body: '{}' }), t('sellers.restored'))} className="p-1.5 rounded-md text-text-muted hover:text-success"><RotateCcw size={13} /></button>
                          : <button type="button" title={t('sellers.delete')} onClick={() => setConfirm({ row: r, kind: 'delete' })} className="p-1.5 rounded-md text-text-muted hover:text-error"><Trash2 size={13} /></button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 && <OrdersPagination page={page} limit={limit} pages={Math.max(1, Math.ceil(total / limit))} total={total} onChange={(n) => setState({ ...(n.page ? { page: String(n.page) } : {}), ...(n.limit ? { limit: String(n.limit), page: '1' } : {}) })} />}

      <SimpleModal open={!!edit} title={`${t('sellers.editTitle')} — ${edit ? name(edit) : ''}`} onClose={() => setEdit(null)} footer={<><Button variant="outline" size="sm" onClick={() => setEdit(null)}>{t('sellers.cancel')}</Button><Button variant="primary" size="sm" loading={busy} onClick={async () => { if (!edit) return; const ok = await call(() => apiFetch(`/api/hub/v1/customers/${id(edit)}`, { method: 'PATCH', body: JSON.stringify({ fullName: form.fullName.trim(), phone: form.phone.trim(), tier: form.tier === '' ? null : Number(form.tier) }) }), t('sellers.saved')); if (ok) setEdit(null); }}>{t('sellers.save')}</Button></>}>
        <div className="space-y-2.5">
          <div><label className="text-[10px] font-semibold text-text-muted uppercase block mb-1">{t('sellers.fullName')}</label><input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className={inputCls} /></div>
          <div><label className="text-[10px] font-semibold text-text-muted uppercase block mb-1">{t('sellers.phone')}</label><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} /></div>
          <div><label className="text-[10px] font-semibold text-text-muted uppercase block mb-1">{t('sellers.tierLabel')}</label>
            <select value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))} className={`${selectCls} w-full`}><option value="">{t('sellers.tierNone')}</option>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{t('sellers.tier', { n })}</option>)}</select></div>
        </div>
      </SimpleModal>

      <SimpleModal open={!!reset} title={`${t('sellers.resetTitle')} — ${reset ? name(reset) : ''}`} onClose={() => setReset(null)} footer={generated ? <Button variant="primary" size="sm" onClick={() => setReset(null)}>OK</Button> : <><Button variant="outline" size="sm" onClick={() => setReset(null)}>{t('sellers.cancel')}</Button><Button variant="primary" size="sm" loading={busy} onClick={async () => { if (!reset) return; setBusy(true); try { const res = await apiFetch<ApiRes<{ generatedPassword?: string }>>(`/api/hub/v1/customers/${id(reset)}/reset-password`, { method: 'POST', body: JSON.stringify(newPw ? { password: newPw } : {}) }); toast('success', t('sellers.resetDone')); if (res.data?.generatedPassword) setGenerated(res.data.generatedPassword); else setReset(null); } catch (e) { toast('error', (e as Error).message); } finally { setBusy(false); } }}>{t('sellers.resetPassword')}</Button></>}>
        {generated ? (
          <div className="space-y-1"><p className="text-[10px] font-semibold text-text-muted uppercase">{t('sellers.generated')}</p><p className="font-mono text-base font-bold text-text-primary inline-flex items-center gap-2">{generated} <CopyButton text={generated} /></p><p className="text-[11px] text-warning">{t('sellers.resetHint')}</p></div>
        ) : (
          <div className="space-y-2"><p className="text-[11px] text-text-muted">{t('sellers.resetHint')}</p><input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={t('sellers.newPassword')} className={inputCls} autoComplete="off" /></div>
        )}
      </SimpleModal>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        loading={busy}
        title={confirm ? t(`sellers.${confirm.kind}`) : ''}
        message={confirm ? t(`sellers.${confirm.kind}Confirm`, { name: name(confirm.row) }) : ''}
        confirmLabel={confirm ? t(`sellers.${confirm.kind}`) : ''}
        confirmColor={confirm?.kind === 'unlock' ? '#15803d' : confirm?.kind === 'lock' ? '#a16207' : '#b91c1c'}
        onConfirm={async () => {
          if (!confirm) return;
          const r = confirm.row;
          const ok = confirm.kind === 'delete'
            ? await call(() => apiFetch(`/api/hub/v1/customers/${id(r)}`, { method: 'DELETE' }), t('sellers.deleted_'))
            : await call(() => apiFetch(`/api/hub/v1/customers/${id(r)}/status`, { method: 'PATCH', body: JSON.stringify({ status: confirm.kind === 'lock' ? '0' : '1' }) }), t('sellers.statusUpdated'));
          if (ok) setConfirm(null);
        }}
      />
    </div>
  );
}

export default function HubSellersPage() {
  return <Suspense fallback={null}><SellersContent /></Suspense>;
}
