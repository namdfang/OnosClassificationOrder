import React, { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import {
  CUSTOMER_API_KEY_MAX_ACTIVE,
  CUSTOMER_SHIP_METHODS,
  CUSTOMER_WEBHOOK_MAX_ACTIVE,
  DEFAULT_CUSTOMER_SHIP_METHOD,
  DesignFieldsZod,
  OPEN_API_MAX_ORDERS_PER_CALL,
} from 'shared';

import { CONFIG } from '@/constants';
import { PATHS } from '@/constants/paths';

import { ApiCodeBlock } from '@/components/customer/ApiCodeBlock';
import { Button } from '@/components/ui/button';

/**
 * Trang tài liệu Public Order API + Webhook (ORD-4) — mở từ nút "Tài liệu API"
 * trên trang API & Webhook (`/customer/api`).
 *
 * Mọi con số giới hạn / danh sách enum lấy TỪ `shared` (nguồn sống, không chép
 * cứng): max đơn/lần, max key, max webhook, ship methods, key vị trí design.
 * Chỉ phần chữ mô tả đi qua i18n (`apiDocs` namespace); tên field / endpoint /
 * ví dụ code là giá trị máy-đọc, giữ nguyên không dịch.
 */

/** Key vị trí design lấy thẳng từ schema shared — thêm vị trí mới tự lên doc. */
const DESIGN_KEYS = Object.keys(DesignFieldsZod.shape);

interface FieldRow {
  name: string;
  type: string;
  required?: boolean;
  /** Giá trị mặc định (hiện kèm badge Tùy chọn). */
  defaultValue?: string;
  /** Key mô tả trong namespace `apiDocs`. */
  descKey: string;
}

const ORDER_FIELDS: FieldRow[] = [
  { name: 'externalRef', type: 'string (1–200)', required: true, descKey: 'create.fields.externalRef' },
  { name: 'shippingAddress', type: 'object', required: true, descKey: 'create.fields.shippingAddress' },
  { name: 'items', type: 'array (1–100)', required: true, descKey: 'create.fields.items' },
  { name: 'orderName', type: 'string (≤300)', descKey: 'create.fields.orderName' },
  { name: 'note', type: 'string (≤1000)', descKey: 'create.fields.note' },
];

const ADDRESS_FIELDS: FieldRow[] = [
  { name: 'firstName', type: 'string (≤200)', required: true, descKey: 'create.address.firstName' },
  { name: 'address1', type: 'string (≤500)', required: true, descKey: 'create.address.address1' },
  { name: 'city', type: 'string (≤200)', required: true, descKey: 'create.address.city' },
  { name: 'state', type: 'string (≤200)', required: true, descKey: 'create.address.state' },
  { name: 'postcode', type: 'string (≤50)', required: true, descKey: 'create.address.postcode' },
  { name: 'country', type: 'string (≤100)', required: true, descKey: 'create.address.country' },
  { name: 'lastName', type: 'string', descKey: 'create.address.lastName' },
  { name: 'company', type: 'string', descKey: 'create.address.company' },
  { name: 'address2', type: 'string', descKey: 'create.address.address2' },
  { name: 'email', type: 'string', descKey: 'create.address.email' },
  { name: 'phone', type: 'string', descKey: 'create.address.phone' },
];

const ITEM_FIELDS: FieldRow[] = [
  { name: 'sku', type: 'string (1–200)', required: true, descKey: 'create.item.sku' },
  { name: 'quantity', type: 'integer ≥ 1', defaultValue: '1', descKey: 'create.item.quantity' },
  {
    name: 'shipMethod',
    type: CUSTOMER_SHIP_METHODS.join(' | '),
    defaultValue: DEFAULT_CUSTOMER_SHIP_METHOD,
    descKey: 'create.item.shipMethod',
  },
  { name: 'designs', type: 'object', descKey: 'create.item.designs' },
  { name: 'tracking', type: 'object', descKey: 'create.item.tracking' },
  { name: 'mockupUrl', type: 'string (≤2000)', descKey: 'create.item.mockupUrl' },
  { name: 'merchantSku', type: 'string (≤200)', descKey: 'create.item.merchantSku' },
  { name: 'activeService', type: 'boolean', descKey: 'create.item.activeService' },
  { name: 'rawItemName', type: 'string (≤300)', descKey: 'create.item.rawItemName' },
  { name: 'rawColor', type: 'string (≤200)', descKey: 'create.item.rawColor' },
  { name: 'rawSize', type: 'string (≤200)', descKey: 'create.item.rawSize' },
];

const TRACKING_FIELDS: FieldRow[] = [
  { name: 'number', type: 'string (≤200)', descKey: 'create.tracking.number' },
  { name: 'carrier', type: 'string (≤100)', descKey: 'create.tracking.carrier' },
  { name: 'url', type: 'string (≤2000)', descKey: 'create.tracking.url' },
  { name: 'labelUrl', type: 'string (≤2000)', descKey: 'create.tracking.labelUrl' },
];

const PUSH_FIELDS: FieldRow[] = [
  { name: 'externalRefs', type: `string[] (≤${OPEN_API_MAX_ORDERS_PER_CALL})`, descKey: 'push.fields.externalRefs' },
  { name: 'ids', type: `string[] (≤${OPEN_API_MAX_ORDERS_PER_CALL})`, descKey: 'push.fields.ids' },
];

const LIST_PARAMS: FieldRow[] = [
  { name: 'page', type: 'integer', defaultValue: '1', descKey: 'list.params.page' },
  { name: 'limit', type: 'integer (1–100)', defaultValue: '20', descKey: 'list.params.limit' },
  { name: 'status', type: 'string', descKey: 'list.params.status' },
  { name: 'held', type: 'boolean', descKey: 'list.params.held' },
  { name: 'search', type: 'string', descKey: 'list.params.search' },
];

const WEBHOOK_EVENT_ROWS: Array<{ event: string; descKey: string }> = [
  { event: 'order.pushed', descKey: 'webhook.events.pushed' },
  { event: 'order.production_completed', descKey: 'webhook.events.completed' },
  { event: 'order.held', descKey: 'webhook.events.held' },
  { event: 'order.unheld', descKey: 'webhook.events.unheld' },
  { event: 'order.cancelled', descKey: 'webhook.events.cancelled' },
];

const WEBHOOK_HEADER_ROWS: Array<{ header: string; descKey: string }> = [
  { header: 'X-Onos-Event', descKey: 'webhook.headers.event' },
  { header: 'X-Onos-Delivery', descKey: 'webhook.headers.delivery' },
  { header: 'X-Onos-Signature', descKey: 'webhook.headers.signature' },
];

const ERROR_ROWS: Array<{ code: string; descKey: string }> = [
  { code: '400', descKey: 'errors.rows.e400' },
  { code: '422', descKey: 'errors.rows.e422' },
  { code: '401', descKey: 'errors.rows.e401' },
  { code: '404', descKey: 'errors.rows.e404' },
  { code: '429', descKey: 'errors.rows.e429' },
];

const SECTION_IDS = ['start', 'flow', 'endpoints', 'create', 'push', 'list', 'get', 'webhook', 'errors'] as const;

function Mono({ children }: { children?: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">{children}</code>;
}

function RequiredBadge({ row }: { row: FieldRow }) {
  const { t } = useTranslation('apiDocs');
  if (row.required) {
    return (
      <span className="inline-block rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400 whitespace-nowrap">
        {t('required')}
      </span>
    );
  }
  return (
    <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground whitespace-nowrap">
      {t('optional')}
      {row.defaultValue ? ` · ${t('defaultLabel')}: ${row.defaultValue}` : ''}
    </span>
  );
}

function FieldTable({ rows }: { rows: FieldRow[] }) {
  const { t } = useTranslation('apiDocs');
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">{t('table.field')}</th>
            <th className="px-3 py-2 font-medium">{t('table.type')}</th>
            <th className="px-3 py-2 font-medium">{t('table.requiredCol')}</th>
            <th className="px-3 py-2 font-medium">{t('table.desc')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.name} className="align-top">
              <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">{row.name}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{row.type}</td>
              <td className="px-3 py-2">
                <RequiredBadge row={row} />
              </td>
              <td className="px-3 py-2 text-[13px] text-muted-foreground">{t(row.descKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold mb-3">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function CustomerApiDocsPage() {
  const { t } = useTranslation('apiDocs');

  // Cổng API thật (dev: 3007, prod: tên miền API) — KHÔNG phải origin của SPA.
  const apiRoot = useMemo(() => (CONFIG.API_URL || window.location.origin).replace(/\/+$/, ''), []);
  const baseUrl = `${apiRoot}/${CONFIG.API_VERSION}/open-api/orders`;

  const curlFirst = [`curl ${baseUrl} \\`, `  -H "X-Api-Key: onos_live_..."`].join('\n');

  const curlCreate = [
    `curl -X POST ${baseUrl} \\`,
    `  -H "X-Api-Key: onos_live_..." \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "orders": [{`,
    `      "externalRef": "DH-1001",`,
    `      "orderName": "#1001 Shopify",`,
    `      "shippingAddress": {`,
    `        "firstName": "John Smith", "address1": "12 Main St", "city": "Austin",`,
    `        "state": "TX", "country": "US", "postcode": "78701"`,
    `      },`,
    `      "items": [{`,
    `        "sku": "TX-BLACK-XL",`,
    `        "quantity": 1,`,
    `        "shipMethod": "express_us",`,
    `        "designs": {`,
    `          "front": "https://drive.google.com/file/d/xxxx/view"`,
    `        }`,
    `      }]`,
    `    }]`,
    `  }'`,
  ].join('\n');

  const createResponse = JSON.stringify(
    {
      success: true,
      data: {
        created: 1,
        duplicated: 0,
        failed: 0,
        results: [{ orderId: 'DH-1001', orderKey: 'dh-1001|', status: 'created' }],
      },
    },
    null,
    2,
  );

  const curlPush = [
    `curl -X POST ${baseUrl}/push \\`,
    `  -H "X-Api-Key: onos_live_..." \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{ "externalRefs": ["DH-1001"] }'`,
  ].join('\n');

  const pushResponse = JSON.stringify(
    {
      success: true,
      data: {
        results: [
          {
            stagingId: '66f0c1e2a1b2c3d4e5f60718',
            orderId: 'DH-1001',
            status: 'pushed',
            productionIds: ['LY-64543-63212'],
          },
        ],
        totalAmount: 12.5,
      },
    },
    null,
    2,
  );

  const curlList = [`curl "${baseUrl}?status=in-production&page=1&limit=20" \\`, `  -H "X-Api-Key: onos_live_..."`].join(
    '\n',
  );

  const curlGet = [`curl ${baseUrl}/DH-1001 -H "X-Api-Key: onos_live_..."`].join('\n');

  const webhookPayload = JSON.stringify(
    {
      id: '66f0c1e2a1b2c3d4e5f60718',
      event: 'order.pushed',
      createdAt: '2026-08-20T09:41:16.000Z',
      data: { productionId: 'LY-64543-63212' },
    },
    null,
    2,
  );

  const verifySnippet = [
    `const crypto = require('crypto');`,
    ``,
    `function verifyOnosSignature(rawBody, signatureHeader, webhookSecret) {`,
    `  const expected = 'sha256=' +`,
    `    crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');`,
    `  return crypto.timingSafeEqual(`,
    `    Buffer.from(signatureHeader), Buffer.from(expected));`,
    `}`,
  ].join('\n');

  const endpointRows = [
    { method: 'POST', path: '/open-api/orders', descKey: 'endpoints.createDesc', anchor: 'create' },
    { method: 'POST', path: '/open-api/orders/push', descKey: 'endpoints.pushDesc', anchor: 'push' },
    { method: 'GET', path: '/open-api/orders', descKey: 'endpoints.listDesc', anchor: 'list' },
    { method: 'GET', path: '/open-api/orders/:ref', descKey: 'endpoints.getDesc', anchor: 'get' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen size={20} className="text-indigo-500" />
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={PATHS.CUSTOMER_API}>
            <ArrowLeft size={14} />
            {t('backBtn')}
          </Link>
        </Button>
      </div>

      {/* Mục lục */}
      <nav className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground mr-1">{t('toc')}:</span>
        {SECTION_IDS.map((id) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-full border border-border px-2.5 py-1 text-foreground hover:bg-muted transition-colors"
          >
            {t(`sections.${id}`)}
          </a>
        ))}
      </nav>

      <Section id="start" title={t('sections.start')}>
        <ApiCodeBlock label={t('start.baseUrlLabel')} code={baseUrl} />
        <div>
          <h3 className="text-sm font-medium mb-1">{t('start.authTitle')}</h3>
          <p className="text-sm text-muted-foreground">
            <Trans
              t={t}
              i18nKey="start.authDesc"
              values={{ max: CUSTOMER_API_KEY_MAX_ACTIVE }}
              components={{ 1: <Mono /> }}
            />
          </p>
        </div>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>
            <Trans t={t} i18nKey="start.contentType" components={{ 1: <Mono /> }} />
          </li>
          <li>{t('start.scope')}</li>
        </ul>
        <ApiCodeBlock label={t('start.curlLabel')} code={curlFirst} />
      </Section>

      <Section id="flow" title={t('sections.flow')}>
        <p className="text-sm text-muted-foreground">{t('flow.intro')}</p>
        <ol className="space-y-2 text-sm text-muted-foreground">
          {(['step1', 'step2', 'step3'] as const).map((step) => (
            <li key={step} className="rounded-lg border border-border px-3 py-2">
              <Trans
                t={t}
                i18nKey={`flow.${step}`}
                components={{ 0: <strong className="text-foreground" />, 2: <Mono /> }}
              />
            </li>
          ))}
        </ol>
      </Section>

      <Section id="endpoints" title={t('sections.endpoints')}>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('table.method')}</th>
                <th className="px-3 py-2 font-medium">{t('table.path')}</th>
                <th className="px-3 py-2 font-medium">{t('table.desc')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {endpointRows.map((row) => (
                <tr key={`${row.method} ${row.path}`} className="align-top">
                  <td className="px-3 py-2 font-mono text-[12px] font-semibold whitespace-nowrap">{row.method}</td>
                  <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">
                    <a href={`#${row.anchor}`} className="text-indigo-500 hover:underline">
                      {row.path}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-[13px] text-muted-foreground">
                    {t(row.descKey, { max: OPEN_API_MAX_ORDERS_PER_CALL })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="create" title={t('sections.create')}>
        <p className="font-mono text-[13px] font-semibold">POST /open-api/orders</p>
        <p className="text-sm text-muted-foreground">{t('create.intro', { max: OPEN_API_MAX_ORDERS_PER_CALL })}</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>
            <Trans t={t} i18nKey="create.idempotent" components={{ 1: <Mono /> }} />
          </li>
          <li>{t('create.wholeFail')}</li>
        </ul>

        <h3 className="text-sm font-medium">{t('create.orderFieldsTitle')}</h3>
        <FieldTable rows={ORDER_FIELDS} />

        <h3 className="text-sm font-medium">{t('create.addressFieldsTitle')}</h3>
        <FieldTable rows={ADDRESS_FIELDS} />

        <h3 className="text-sm font-medium">{t('create.itemFieldsTitle')}</h3>
        <FieldTable rows={ITEM_FIELDS} />

        <div>
          <h3 className="text-sm font-medium mb-1">{t('create.designsTitle')}</h3>
          <p className="text-sm text-muted-foreground mb-2">{t('create.designsDesc')}</p>
          <div className="flex flex-wrap gap-1.5">
            {DESIGN_KEYS.map((key) => (
              <span key={key} className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px]">
                {key}
              </span>
            ))}
          </div>
          <p className="mt-2 rounded-lg border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <Trans t={t} i18nKey="create.designsRule" components={{ 1: <Mono /> }} />
          </p>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-1">{t('create.trackingTitle')}</h3>
          <p className="text-sm text-muted-foreground mb-2">{t('create.trackingDesc')}</p>
          <FieldTable rows={TRACKING_FIELDS} />
        </div>

        <ApiCodeBlock label={t('create.curlLabel')} code={curlCreate} />
        <div>
          <ApiCodeBlock label={t('create.responseLabel')} code={createResponse} />
          <p className="mt-2 text-xs text-muted-foreground">
            <Trans t={t} i18nKey="create.responseNote" components={{ 1: <Mono /> }} />
          </p>
        </div>
      </Section>

      <Section id="push" title={t('sections.push')}>
        <p className="font-mono text-[13px] font-semibold">POST /open-api/orders/push</p>
        <p className="text-sm text-muted-foreground">
          <Trans
            t={t}
            i18nKey="push.intro"
            values={{ max: OPEN_API_MAX_ORDERS_PER_CALL }}
            components={{ 1: <Mono /> }}
          />
        </p>
        <FieldTable rows={PUSH_FIELDS} />
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>{t('push.notes.whole')}</li>
          <li>{t('push.notes.artwork')}</li>
          <li>{t('push.notes.idempotent')}</li>
          <li>{t('push.notes.price')}</li>
        </ul>
        <ApiCodeBlock label={t('push.curlLabel')} code={curlPush} />
        <ApiCodeBlock label={t('push.responseLabel')} code={pushResponse} />
      </Section>

      <Section id="list" title={t('sections.list')}>
        <p className="font-mono text-[13px] font-semibold">GET /open-api/orders</p>
        <p className="text-sm text-muted-foreground">{t('list.intro')}</p>
        <FieldTable rows={LIST_PARAMS} />
        <ApiCodeBlock label={t('list.curlLabel')} code={curlList} />
      </Section>

      <Section id="get" title={t('sections.get')}>
        <p className="font-mono text-[13px] font-semibold">GET /open-api/orders/:ref</p>
        <p className="text-sm text-muted-foreground">
          <Trans t={t} i18nKey="get.intro" components={{ 1: <Mono /> }} />
        </p>
        <ApiCodeBlock label={t('get.curlLabel')} code={curlGet} />
      </Section>

      <Section id="webhook" title={t('sections.webhook')}>
        <p className="text-sm text-muted-foreground">
          <Trans
            t={t}
            i18nKey="webhook.intro"
            values={{ max: CUSTOMER_WEBHOOK_MAX_ACTIVE }}
            components={{ 1: <Mono /> }}
          />
        </p>

        <h3 className="text-sm font-medium">{t('webhook.eventsTitle')}</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('table.event')}</th>
                <th className="px-3 py-2 font-medium">{t('table.meaning')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {WEBHOOK_EVENT_ROWS.map((row) => (
                <tr key={row.event}>
                  <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">{row.event}</td>
                  <td className="px-3 py-2 text-[13px] text-muted-foreground">{t(row.descKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-sm font-medium">{t('webhook.deliveryTitle')}</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>{t('webhook.delivery.post')}</li>
          <li>{t('webhook.delivery.retry')}</li>
          <li>{t('webhook.delivery.perItem')}</li>
          <li>{t('webhook.delivery.dedupe')}</li>
        </ul>

        <h3 className="text-sm font-medium">{t('webhook.headersTitle')}</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('table.header')}</th>
                <th className="px-3 py-2 font-medium">{t('table.desc')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {WEBHOOK_HEADER_ROWS.map((row) => (
                <tr key={row.header}>
                  <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">{row.header}</td>
                  <td className="px-3 py-2 text-[13px] text-muted-foreground">{t(row.descKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <ApiCodeBlock label={t('webhook.payloadLabel')} code={webhookPayload} />
          <p className="mt-2 text-xs text-muted-foreground">{t('webhook.payloadNote')}</p>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-1">{t('webhook.verifyTitle')}</h3>
          <p className="text-sm text-muted-foreground mb-2">{t('webhook.verifyDesc')}</p>
          <ApiCodeBlock label={t('webhook.verifyLabel')} code={verifySnippet} />
        </div>
      </Section>

      <Section id="errors" title={t('sections.errors')}>
        <p className="text-sm text-muted-foreground">{t('errors.intro')}</p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('table.code')}</th>
                <th className="px-3 py-2 font-medium">{t('table.when')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ERROR_ROWS.map((row) => (
                <tr key={row.code} className="align-top">
                  <td className="px-3 py-2 font-mono text-[12px] font-semibold">{row.code}</td>
                  <td className="px-3 py-2 text-[13px] text-muted-foreground">{t(row.descKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
