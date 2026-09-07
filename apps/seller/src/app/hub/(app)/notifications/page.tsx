'use client';

import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import type { CustomerAdminRow, CustomerNotification } from 'shared';
import { Button } from '@/components/shared/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { OrdersPagination } from '@/components/orders/orders-pagination';
import { PageHeader } from '@/components/shared/page-header';
import { useToast } from '@/components/shared/toast';
import { apiFetch, useApi } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-border1 bg-card text-xs text-text-primary outline-none focus:border-accent';

/** Mirror `apps/web/src/components/settings/CustomerNotificationSender.tsx` (CustomerPortal.md §8). */
export default function HubNotificationsPage() {
  const { t } = useTranslation('hub');
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const limit = 20;
  const { data: sent, loading, refetch } = useApi<ApiRes<CustomerNotification[]>>(`/api/hub/v1/customer-notifications/sent?page=${page}&limit=${limit}`);
  const [sellerQ, setSellerQ] = useState('');
  const { data: sellers } = useApi<ApiRes<CustomerAdminRow[]>>(`/api/hub/v1/customers?page=1&limit=20&hasAccount=true${sellerQ ? `&search=${encodeURIComponent(sellerQ)}` : ''}`);
  const [customerId, setCustomerId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim()) return;
    setSending(true);
    try {
      await apiFetch('/api/hub/v1/customer-notifications', { method: 'POST', body: JSON.stringify({ title: title.trim(), body: body.trim() || undefined, ...(customerId ? { customerId } : {}) }) });
      toast('success', t('notifications.sent'));
      setTitle('');
      setBody('');
      setPage(1);
      refetch();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const rows = sent?.data ?? [];
  const total = sent?.total ?? 0;
  return (
    <div className="space-y-4">
      <PageHeader title={t('notifications.title')} subtitle={t('notifications.subtitle')} />
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        <Card>
          <CardHeader><CardTitle>{t('notifications.sendTitle')}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase block mb-1">{t('notifications.recipient')}</label>
                <input value={sellerQ} onChange={(e) => setSellerQ(e.target.value)} placeholder={t('sellers.search')} className={`${inputCls} mb-1`} />
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
                  <option value="">{t('notifications.broadcast')}</option>
                  {(sellers?.data ?? []).map((c) => <option key={String(c._id)} value={String(c._id)}>{c.userSku} · {c.userEmail}</option>)}
                </select>
              </div>
              <div><label className="text-[10px] font-semibold text-text-muted uppercase block mb-1">{t('notifications.titleLabel')}</label><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} /></div>
              <div><label className="text-[10px] font-semibold text-text-muted uppercase block mb-1">{t('notifications.bodyLabel')}</label><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} className={inputCls} /></div>
              <Button variant="primary" className="w-full" loading={sending} disabled={!title.trim()} onClick={send}><Send size={13} className="mr-1.5" />{t('notifications.send')}</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('notifications.history')}</CardTitle></CardHeader>
          <CardContent>
            {loading && rows.length === 0 ? (
              <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : rows.length === 0 ? (
              <EmptyState title={t('notifications.empty')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead><tr className="text-[10px] uppercase tracking-wider text-text-muted">
                    <th className="py-2 pr-3 text-left font-semibold">{t('notifications.columns.when')}</th>
                    <th className="py-2 pr-3 text-left font-semibold">{t('notifications.columns.to')}</th>
                    <th className="py-2 pr-3 text-left font-semibold">{t('notifications.columns.title')}</th>
                    <th className="py-2 text-left font-semibold">{t('notifications.columns.by')}</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((n) => (
                      <tr key={String(n._id)} className="border-t border-border2 align-top">
                        <td className="py-2 pr-3 whitespace-nowrap text-text-secondary">{n.createdAt ? dayjs(n.createdAt).format('DD/MM/YYYY HH:mm') : ''}</td>
                        <td className="py-2 pr-3 text-text-secondary">{n.customerLabel || (n.customerId ? String(n.customerId) : t('notifications.broadcast'))}</td>
                        <td className="py-2 pr-3"><p className="font-semibold text-text-primary">{n.title}</p>{n.body && <p className="text-[11px] text-text-muted">{n.body}</p>}</td>
                        <td className="py-2 text-text-secondary">{n.event ? t('notifications.systemEvent') : n.createdByName || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {total > limit && <div className="mt-3"><OrdersPagination page={page} limit={limit} pages={Math.ceil(total / limit)} total={total} onChange={(n) => { if (n.page) setPage(n.page); }} /></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
