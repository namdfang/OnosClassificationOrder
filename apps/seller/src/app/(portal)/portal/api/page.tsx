'use client';

import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, KeyRound, Plus, Radio, Rocket, Trash2 } from 'lucide-react';
import { CUSTOMER_WEBHOOK_EVENTS } from 'shared/client';
import type { CustomerApiKey, CustomerWebhook } from 'shared';
import { SimpleModal } from '@/components/hub/simple-modal';
import { ApiCodeBlock } from '@/components/shared/api-code-block';
import { Button } from '@/components/shared/button';
import { ConfirmModal } from '@/components/shared/confirm-modal';
import { PageHeader } from '@/components/shared/page-header';
import { useToast } from '@/components/shared/toast';
import { apiFetch, useApi } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';

type TabId = 'keys' | 'webhooks' | 'samples';
const inputCls = 'w-full px-3 py-2 rounded-lg border border-border1 bg-card text-[12px] text-text-primary outline-none focus:border-accent font-mono';

function Section({ icon, title, description, action, children }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border1 rounded-xl p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-accent-light text-accent flex items-center justify-center shrink-0">{icon}</span>
          <div>
            <div className="text-[13px] font-bold text-text-primary">{title}</div>
            {description && <p className="text-[11px] text-text-secondary mt-0.5">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * API & Webhook — tab riêng như `portal/api-keys` của thghub (tab bar: Bắt đầu/Key · Webhook · Lệnh mẫu),
 * tái dùng `customer/api-keys` + `customer/webhooks` (ORD-4). Tài liệu đầy đủ vẫn ở cổng cũ (đợt 2).
 */
export default function ApiPage() {
  const { t } = useTranslation(['customerPortal', 'seller', 'common']);
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>('keys');
  const { data: keysRes, refetch: refetchKeys } = useApi<ApiRes<CustomerApiKey[]>>('/api/v1/customer/api-keys');
  const { data: hooksRes, refetch: refetchHooks } = useApi<ApiRes<CustomerWebhook[]>>('/api/v1/customer/webhooks');
  const keys = keysRes?.data ?? [];
  const webhooks = hooksRes?.data ?? [];

  const [keyDialog, setKeyDialog] = useState(false);
  const [keyLabel, setKeyLabel] = useState('');
  const [plainKey, setPlainKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<CustomerApiKey | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [deleteHook, setDeleteHook] = useState<CustomerWebhook | null>(null);

  const apiRoot = (process.env.NEXT_PUBLIC_OPEN_API_URL || 'https://api.onosfactory.com/api/v1').replace(/\/+$/, '');
  const baseUrl = `${apiRoot}/open-api/orders`;
  const curlCreate = useMemo(() => [
    `curl -X POST ${baseUrl} \\`, `  -H "X-Api-Key: onos_live_..." \\`, `  -H "Content-Type: application/json" \\`, `  -d '{`,
    `    "orders": [{`, `      "externalRef": "DH-1001",`, `      "shippingAddress": {`,
    `        "firstName": "Nguyen Van A", "address1": "12 Main St", "city": "Austin",`, `        "state": "TX", "country": "US", "postcode": "78701"`, `      },`,
    `      "items": [{`, `        "sku": "TX-BLACK-XL", "quantity": 1,`, `        "tracking": {`,
    `          "number": "9400111899223197428490", "carrier": "USPS",`, `          "url": "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490",`,
    `          "labelUrl": "https://example.com/label.pdf"`, `        }`, `      }]`, `    }]`, `  }'`,
  ].join('\n'), [baseUrl]);
  const curlPush = `curl -X POST ${baseUrl}/push \\\n  -H "X-Api-Key: onos_live_..." \\\n  -H "Content-Type: application/json" \\\n  -d '{ "externalRefs": ["DH-1001"] }'`;
  const curlTrack = `curl ${baseUrl}/DH-1001 -H "X-Api-Key: onos_live_..."`;
  const webhookPayload = JSON.stringify({ id: '66f0c1e2a1b2c3d4e5f60718', event: 'order.pushed', createdAt: '2026-08-20T09:41:16.000Z', data: { productionId: 'LY-64543-63212', externalRef: 'DH-1001' } }, null, 2);

  const createKey = async () => {
    if (!keyLabel.trim()) return toast('error', t('customerPortal:apiAccess.keys.labelRequired'));
    setBusy(true);
    try {
      const res = await apiFetch<ApiRes<{ key: string }>>('/api/v1/customer/api-keys', { method: 'POST', body: JSON.stringify({ label: keyLabel.trim() }) });
      setKeyDialog(false);
      setKeyLabel('');
      setPlainKey(res.data.key);
      refetchKeys();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const revokeKey = async () => {
    if (!revokeTarget) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/customer/api-keys/${encodeURIComponent(revokeTarget._id)}`, { method: 'DELETE' });
      toast('success', t('customerPortal:apiAccess.keys.revoked', { label: revokeTarget.label }));
      setRevokeTarget(null);
      refetchKeys();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const createWebhook = async () => {
    if (!webhookUrl.trim()) return toast('error', t('customerPortal:apiAccess.webhooks.urlRequired'));
    setBusy(true);
    try {
      await apiFetch('/api/v1/customer/webhooks', { method: 'POST', body: JSON.stringify({ url: webhookUrl.trim() }) });
      toast('success', t('customerPortal:apiAccess.webhooks.created'));
      setWebhookUrl('');
      refetchHooks();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const removeWebhook = async () => {
    if (!deleteHook) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/customer/webhooks/${encodeURIComponent(deleteHook._id)}`, { method: 'DELETE' });
      toast('success', t('customerPortal:apiAccess.webhooks.deleted'));
      setDeleteHook(null);
      refetchHooks();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const TABS: { id: TabId; label: string; icon: typeof Rocket }[] = [
    { id: 'keys', label: t('seller:api.tabKeys'), icon: KeyRound },
    { id: 'webhooks', label: t('seller:api.tabWebhooks'), icon: Radio },
    { id: 'samples', label: t('seller:api.tabSamples'), icon: Rocket },
  ];
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL;

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader
        title={t('customerPortal:apiAccess.title')}
        subtitle={t('customerPortal:apiAccess.subtitle')}
        actions={adminUrl ? <a href={`${adminUrl}/customer/api/docs`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border1 bg-card text-[11px] font-semibold text-text-primary hover:border-accent hover:text-accent no-underline"><BookOpen size={12} />{t('customerPortal:apiAccess.docsBtn')}</a> : undefined}
      />

      {plainKey && (
        <div className="rounded-xl border border-[#e0bd10] bg-[#fdf6d6] p-4 space-y-2">
          <p className="text-[12px] font-bold text-[#3a2a00]">{t('customerPortal:apiAccess.keys.plainTitle')}</p>
          <p className="text-[11px] text-[#5a4500]">{t('customerPortal:apiAccess.keys.plainWarning')}</p>
          <ApiCodeBlock label={t('customerPortal:apiAccess.keys.plainLabel')} code={plainKey} />
          <div className="flex justify-end"><Button variant="primary" size="sm" onClick={() => setPlainKey('')}>{t('customerPortal:apiAccess.keys.plainDone')}</Button></div>
        </div>
      )}

      <div role="tablist" className="bg-card border border-border1 rounded-xl px-1 py-1 flex items-center gap-1 overflow-x-auto">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const selected = tab === tb.id;
          return (
            <button key={tb.id} role="tab" aria-selected={selected} onClick={() => setTab(tb.id)} className={`text-[11px] font-semibold px-3 py-1.5 rounded-md whitespace-nowrap transition-colors border-none cursor-pointer inline-flex items-center gap-1.5 ${selected ? 'bg-cta text-cta-foreground' : 'text-text-secondary hover:bg-card-hover'}`}>
              <Icon size={12} /> {tb.label}
            </button>
          );
        })}
      </div>

      {tab === 'keys' && (
        <Section icon={<KeyRound size={15} />} title={t('customerPortal:apiAccess.keys.title')} description={t('customerPortal:apiAccess.keys.description')} action={<Button variant="primary" size="sm" onClick={() => setKeyDialog(true)}><Plus size={12} />{t('customerPortal:apiAccess.keys.createBtn')}</Button>}>
          {keys.length === 0 ? (
            <p className="text-[12px] text-text-muted py-4 text-center">{t('customerPortal:apiAccess.keys.empty')}</p>
          ) : (
            <ul className="divide-y divide-border2">
              {keys.map((k) => (
                <li key={k._id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-text-primary truncate">{k.label}</p>
                    <p className="font-mono text-[11px] text-text-muted mt-0.5">{k.prefix}…</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-[10.5px] text-text-muted">
                      <p>{t('customerPortal:apiAccess.keys.createdAt', { date: dayjs(k.createdAt).format('DD/MM/YYYY') })}</p>
                      <p>{k.lastUsedAt ? t('customerPortal:apiAccess.keys.lastUsedAt', { date: dayjs(k.lastUsedAt).format('DD/MM/YYYY HH:mm') }) : t('customerPortal:apiAccess.keys.neverUsed')}</p>
                    </div>
                    <button type="button" onClick={() => setRevokeTarget(k)} className="text-[11px] font-semibold text-error hover:underline">{t('customerPortal:apiAccess.keys.revokeBtn')}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === 'webhooks' && (
        <Section icon={<Radio size={15} />} title={t('customerPortal:apiAccess.webhooks.title')} description={t('customerPortal:apiAccess.webhooks.description')}>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className={inputCls} placeholder="https://example.com/hooks/onos" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
            <Button variant="primary" size="sm" loading={busy} onClick={createWebhook} className="sm:shrink-0"><Plus size={12} />{t('customerPortal:apiAccess.webhooks.addBtn')}</Button>
          </div>
          <p className="text-[11px] text-text-muted">{t('customerPortal:apiAccess.webhooks.eventsLabel')}</p>
          <div className="flex flex-wrap gap-1.5">
            {CUSTOMER_WEBHOOK_EVENTS.map((e) => <span key={e} className="rounded border border-border1 px-1.5 py-0.5 font-mono text-[10.5px] text-text-primary">{e}</span>)}
          </div>
          {webhooks.length > 0 && (
            <ul className="divide-y divide-border2 border-t border-border2">
              {webhooks.map((w) => (
                <li key={w._id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-mono text-[11.5px] text-text-primary truncate">{w.url}</p>
                    <p className="text-[10.5px] text-text-muted mt-0.5">{t('customerPortal:apiAccess.webhooks.secretLabel')} <span className="font-mono">{w.secret}</span></p>
                    <p className="text-[10px] text-text-muted">{w.lastSuccessAt ? `✓ ${dayjs(w.lastSuccessAt).format('DD/MM HH:mm')}` : ''}{w.lastFailureAt ? ` · ✗ ${dayjs(w.lastFailureAt).format('DD/MM HH:mm')}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => setDeleteHook(w)} className="p-1.5 rounded-md text-text-muted hover:text-error hover:bg-error-bg"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-2">
            <p className="text-[11px] text-text-muted mb-1.5">{t('customerPortal:apiAccess.guide.webhookPayloadNote')}</p>
            <ApiCodeBlock label={t('customerPortal:apiAccess.guide.payloadLabel')} code={webhookPayload} />
          </div>
        </Section>
      )}

      {tab === 'samples' && (
        <Section icon={<Rocket size={15} />} title={t('customerPortal:apiAccess.guide.title')} description={t('customerPortal:apiAccess.guide.description')}>
          <div className="space-y-4">
            <ApiCodeBlock label={t('customerPortal:apiAccess.guide.createLabel')} code={curlCreate} />
            <ApiCodeBlock label={t('customerPortal:apiAccess.guide.pushLabel')} code={curlPush} />
            <ApiCodeBlock label={t('customerPortal:apiAccess.guide.trackLabel')} code={curlTrack} />
          </div>
        </Section>
      )}

      <SimpleModal open={keyDialog} title={t('customerPortal:apiAccess.keys.dialogTitle')} onClose={() => setKeyDialog(false)} footer={<><Button variant="outline" size="sm" onClick={() => setKeyDialog(false)}>{t('common:actions.cancel')}</Button><Button variant="primary" size="sm" loading={busy} onClick={createKey}>{t('customerPortal:apiAccess.keys.createBtn')}</Button></>}>
        <p className="text-[11px] text-text-secondary mb-2">{t('customerPortal:apiAccess.keys.dialogDescription')}</p>
        <input autoFocus className={inputCls} placeholder={t('customerPortal:apiAccess.keys.labelPlaceholder')} value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createKey()} />
      </SimpleModal>
      <ConfirmModal open={!!revokeTarget} onClose={() => setRevokeTarget(null)} onConfirm={revokeKey} loading={busy} title={t('customerPortal:apiAccess.keys.revokeBtn')} message={revokeTarget?.label ?? ''} confirmLabel={t('customerPortal:apiAccess.keys.revokeBtn')} />
      <ConfirmModal open={!!deleteHook} onClose={() => setDeleteHook(null)} onConfirm={removeWebhook} loading={busy} title={t('customerPortal:apiAccess.webhooks.title')} message={deleteHook?.url ?? ''} confirmLabel={t('common:actions.delete', { defaultValue: 'Delete' })} />
    </div>
  );
}
