import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Check, Copy, KeyRound, Plus, Trash2, Webhook } from 'lucide-react';
import type { CustomerApiKey, CustomerWebhook } from 'shared';
import { CUSTOMER_WEBHOOK_EVENTS } from 'shared';
import { toast } from 'sonner';

import { CONFIG } from '@/constants';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

/**
 * Trang "API & Webhook" — Customer Portal (ORD-4).
 *
 * 3 khối dọc theo đúng thứ tự khách làm việc: lấy key → đăng ký webhook →
 * dán lệnh chạy thử. Mọi giá trị máy-đọc (key, endpoint, payload) đặt trong
 * khối `font-mono` nền đậm để tách khỏi chữ người-đọc; key plain chỉ hiện
 * MỘT lần trong dialog ngay sau khi tạo.
 */

/** Khối lệnh copy-được — dùng cho curl mẫu + payload webhook. */
function CodeBlock({ code, label }: { code: string; label?: string }) {
  const { t } = useTranslation('customerPortal');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(t('apiAccess.copied'));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-800">
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-slate-300 hover:text-white hover:bg-slate-800"
          onClick={handleCopy}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </Button>
      </div>
      <pre className="px-3 py-2.5 overflow-x-auto text-[12px] leading-relaxed font-mono text-slate-100 whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 text-indigo-500">{icon}</span>
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function CustomerApiPage() {
  const { t } = useTranslation(['customerPortal', 'common']);
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<CustomerApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<CustomerWebhook[]>([]);

  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyLabel, setKeyLabel] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  /** Key plain vừa tạo — server KHÔNG trả lại lần thứ hai. */
  const [plainKey, setPlainKey] = useState('');

  const [webhookUrl, setWebhookUrl] = useState('');
  const [creatingWebhook, setCreatingWebhook] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [keyRes, hookRes] = await Promise.all([
        RepositoryRemote.customerApiAccess.listApiKeys(),
        RepositoryRemote.customerApiAccess.listWebhooks(),
      ]);
      setKeys((keyRes.data?.data ?? []) as CustomerApiKey[]);
      setWebhooks((hookRes.data?.data ?? []) as CustomerWebhook[]);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreateKey = async () => {
    if (!keyLabel.trim()) {
      toast.error(t('apiAccess.keys.labelRequired'));
      return;
    }
    try {
      setCreatingKey(true);
      const res = await RepositoryRemote.customerApiAccess.createApiKey({ label: keyLabel.trim() });
      setPlainKey(res.data?.data?.key ?? '');
      setKeyLabel('');
      setKeyDialogOpen(false);
      await fetchData();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (key: CustomerApiKey) => {
    try {
      await RepositoryRemote.customerApiAccess.revokeApiKey(key._id);
      toast.success(t('apiAccess.keys.revoked', { label: key.label }));
      await fetchData();
    } catch (err) {
      handleAxiosError(err);
    }
  };

  const handleCreateWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error(t('apiAccess.webhooks.urlRequired'));
      return;
    }
    try {
      setCreatingWebhook(true);
      await RepositoryRemote.customerApiAccess.createWebhook({ url: webhookUrl.trim() });
      setWebhookUrl('');
      toast.success(t('apiAccess.webhooks.created'));
      await fetchData();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      await RepositoryRemote.customerApiAccess.deleteWebhook(id);
      toast.success(t('apiAccess.webhooks.deleted'));
      await fetchData();
    } catch (err) {
      handleAxiosError(err);
    }
  };

  /**
   * Base URL của lệnh mẫu phải là CỔNG API (`CONFIG.API_URL`), KHÔNG phải
   * origin của trang: ở dev, giao diện chạy cổng 5173 còn API cổng 3007 và
   * Vite KHÔNG proxy `/api`, nên lệnh dựng từ `window.location.origin` trả về
   * trang HTML của SPA; trên production hai bên còn khác hẳn tên miền. Rơi về
   * origin chỉ khi thiếu biến môi trường (bản build lỗi cấu hình).
   */
  const baseUrl = useMemo(() => {
    const apiRoot = (CONFIG.API_URL || window.location.origin).replace(/\/+$/, '');
    return `${apiRoot}/${CONFIG.API_VERSION}/open-api/orders`;
  }, []);

  const curlCreate = useMemo(
    () =>
      [
        `curl -X POST ${baseUrl} \\`,
        `  -H "X-Api-Key: onos_live_..." \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{`,
        `    "orders": [{`,
        `      "externalRef": "DH-1001",`,
        `      "shippingAddress": {`,
        `        "firstName": "Nguyen Van A", "address1": "12 Main St", "city": "Austin",`,
        `        "state": "TX", "country": "US", "postcode": "78701"`,
        `      },`,
        `      "items": [{`,
        `        "sku": "TX-BLACK-XL", "quantity": 1,`,
        // Vận đơn khách tự cấp (tuỳ chọn) — có thì đi thẳng vào module vận đơn
        // lúc push, xưởng in dán ở công đoạn Đóng hàng.
        `        "tracking": {`,
        `          "number": "9400111899223197428490", "carrier": "USPS",`,
        `          "url": "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490",`,
        `          "labelUrl": "https://example.com/label.pdf"`,
        `        }`,
        `      }]`,
        `    }]`,
        `  }'`,
      ].join('\n'),
    [baseUrl],
  );

  const curlPush = useMemo(
    () =>
      [
        `curl -X POST ${baseUrl}/push \\`,
        `  -H "X-Api-Key: onos_live_..." \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{ "externalRefs": ["DH-1001"] }'`,
      ].join('\n'),
    [baseUrl],
  );

  const curlTrack = useMemo(
    () => `curl ${baseUrl}/DH-1001 -H "X-Api-Key: onos_live_..."`,
    [baseUrl],
  );

  const webhookPayload = useMemo(
    () =>
      JSON.stringify(
        {
          id: '66f0c1e2a1b2c3d4e5f60718',
          event: 'order.pushed',
          createdAt: '2026-08-20T09:41:16.000Z',
          data: { productionId: 'LY-64543-63212', externalRef: 'DH-1001' },
        },
        null,
        2,
      ),
    [],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-semibold">{t('apiAccess.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('apiAccess.subtitle')}</p>
      </div>

      <SectionCard
        icon={<KeyRound size={18} />}
        title={t('apiAccess.keys.title')}
        description={t('apiAccess.keys.description')}
        action={
          <Button size="sm" onClick={() => setKeyDialogOpen(true)}>
            <Plus size={14} />
            {t('apiAccess.keys.createBtn')}
          </Button>
        }
      >
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('apiAccess.keys.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((k) => (
              <li key={k._id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{k.label}</p>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">{k.prefix}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{t('apiAccess.keys.createdAt', { date: dayjs(k.createdAt).format('DD/MM/YYYY') })}</p>
                    <p>
                      {k.lastUsedAt
                        ? t('apiAccess.keys.lastUsedAt', { date: dayjs(k.lastUsedAt).format('DD/MM/YYYY HH:mm') })
                        : t('apiAccess.keys.neverUsed')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRevokeKey(k)}
                  >
                    {t('apiAccess.keys.revokeBtn')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        icon={<Webhook size={18} />}
        title={t('apiAccess.webhooks.title')}
        description={t('apiAccess.webhooks.description')}
      >
        <div className="flex flex-wrap gap-2">
          <Input
            className="flex-1 min-w-[240px] font-mono text-xs"
            placeholder="https://example.com/hooks/onos"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <Button size="sm" onClick={handleCreateWebhook} disabled={creatingWebhook}>
            {t('apiAccess.webhooks.addBtn')}
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">{t('apiAccess.webhooks.eventsLabel')}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CUSTOMER_WEBHOOK_EVENTS.map((e) => (
            <span key={e} className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {e}
            </span>
          ))}
        </div>

        {webhooks.length > 0 && (
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {webhooks.map((w) => (
              <li key={w._id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-xs truncate">{w.url}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t('apiAccess.webhooks.secretLabel')} <span className="font-mono">{w.secret}</span>
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteWebhook(w._id)}>
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        icon={<span className="font-mono text-sm font-semibold">{'{ }'}</span>}
        title={t('apiAccess.guide.title')}
        description={t('apiAccess.guide.description')}
      >
        <div className="space-y-4">
          <CodeBlock label={t('apiAccess.guide.createLabel')} code={curlCreate} />
          <CodeBlock label={t('apiAccess.guide.pushLabel')} code={curlPush} />
          <CodeBlock label={t('apiAccess.guide.trackLabel')} code={curlTrack} />
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">{t('apiAccess.guide.webhookPayloadNote')}</p>
            <CodeBlock label={t('apiAccess.guide.payloadLabel')} code={webhookPayload} />
          </div>
        </div>
      </SectionCard>

      {/* Tạo key */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apiAccess.keys.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('apiAccess.keys.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={t('apiAccess.keys.labelPlaceholder')}
            value={keyLabel}
            onChange={(e) => setKeyLabel(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyDialogOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={handleCreateKey} disabled={creatingKey}>
              {t('apiAccess.keys.createBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Key plain — hiện đúng MỘT lần */}
      <Dialog open={!!plainKey} onOpenChange={(o) => !o && setPlainKey('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apiAccess.keys.plainTitle')}</DialogTitle>
            <DialogDescription className="text-amber-600 dark:text-amber-500">
              {t('apiAccess.keys.plainWarning')}
            </DialogDescription>
          </DialogHeader>
          <CodeBlock label={t('apiAccess.keys.plainLabel')} code={plainKey} />
          <DialogFooter>
            <Button onClick={() => setPlainKey('')}>{t('apiAccess.keys.plainDone')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
