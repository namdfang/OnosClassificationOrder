import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Clock, Play, WifiOff } from 'lucide-react';
import { AGENT_ERROR_CODES } from 'shared';

import type { AgentCallResult } from '@/services/agentApi';
import { agentUrl, buildCurl, callAgent } from '@/services/agentApi';

import { CopyButton } from '@/components/common/CopyButton';
import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { cn } from '@/utils/cn';

import type { AgentAdminOverview, CapabilityKey } from './types';
import { CAPABILITIES } from './types';

/** Nguong CAT phan HIEN THI (AC-14). Nut copy van lay toan bo. */
const DISPLAY_LIMIT = 200_000;

const sample = (body: unknown): string => JSON.stringify(body, null, 2);

/**
 * Ba mau day nguoi dung goi cho dung. Hinh dang PHAI khop `AgentQueryZod`
 * (`packages/shared/dtos/agent-api.dto.ts`) va bo dich filter
 * (`apps/api/src/modules/agent-api/mongo-filter.ts`) — KHONG viet theo tri nho:
 *   filter    = CU PHAP MONGODB, vd { "quantity": { "$gte": 1, "$lte": 9 } }
 *   select    = { kind, fields[], sort: [{ field, dir }], limit }
 *   aggregate = { groupBy: [...], metrics: [{ op, field?, as }] }
 * `select` va `aggregate` LOAI TRU nhau — gui ca hai la INVALID_QUERY.
 *
 * Cu phap cay { field, op, value } la cua DSL CU, `API-8` da bo. Gui dang do
 * nay se nhan 400 INVALID_QUERY.
 */
const QUERY_SAMPLES: Record<string, string> = {
  sampleCount: sample({
    table: 'orders',
    aggregate: { groupBy: ['status'], metrics: [{ op: 'count', as: 'total' }] },
  }),
  sampleFilter: sample({
    table: 'orders',
    filter: { inProductionAt: { $gte: '2026-08-01' }, status: { $eq: 'Ready' } },
    select: { kind: 'rows', fields: ['productionId', 'status', 'inProductionAt'], limit: 20 },
  }),
  sampleSort: sample({
    table: 'orders',
    select: {
      kind: 'rows',
      fields: ['productionId', 'createdAt'],
      sort: [{ field: 'createdAt', dir: 'desc' }],
      limit: 10,
    },
  }),
};

/** Mau cho O NHAP FILTER cua phan doc tho — cung cu phap MongoDB. */
const READ_FILTER_SAMPLES: Record<string, string> = {
  filterSampleEq: sample({ productionId: { $eq: 'SQ-01912-84416' } }),
  filterSampleRange: sample({ quantity: { $gte: 1, $lte: 9 } }),
  filterSamplePrefix: sample({ productionId: { $startsWith: 'SQ-019' } }),
};

interface Props {
  overview: AgentAdminOverview;
  /** Bang duoc chon san khi nguoi xem bam "Thu doc bang nay" o phan B. */
  presetTable?: string;
  ensureKey: () => Promise<string>;
}

/**
 * Phan D — Thu goi (AC-07, AC-08, AC-12, AC-13, AC-14).
 *
 * Bon quy tac khong duoc pha:
 *  1. Form KHONG bao gio bi xoa sau loi — nguoi xem sua lai chinh cai vua gui.
 *  2. Loi hien NGUYEN `code` + thong diep goc, khong nuot thanh cau chung.
 *  3. Rong-thanh-cong hien MAU XANH, khac han khoi loi.
 *  4. `curl` mac dinh dung `$AGENT_API_KEY`; chen khoa that phai tick.
 */
export function TryTab({ overview, presetTable, ensureKey }: Props) {
  const { t } = useTranslation('agentApi');

  const [capability, setCapability] = useState<CapabilityKey>(presetTable ? 'readRows' : 'listTables');
  const [table, setTable] = useState(presetTable || overview.tables[0]?.key || '');
  const [limit, setLimit] = useState('20');
  const [cursor, setCursor] = useState('');
  const [fields, setFields] = useState('');
  const [readFilter, setReadFilter] = useState('');
  const [slug, setSlug] = useState('');
  const [queryBody, setQueryBody] = useState(QUERY_SAMPLES.sampleCount);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentCallResult | null>(null);
  const [showRealKey, setShowRealKey] = useState(false);
  const [key, setKey] = useState('');

  const spec = CAPABILITIES.find((c) => c.key === capability) as (typeof CAPABILITIES)[number];

  const request = useMemo(() => {
    switch (capability) {
      case 'readRows':
        return {
          method: 'GET' as const,
          url: agentUrl(overview.basePath, `/tables/${encodeURIComponent(table)}/rows`, {
            limit,
            cursor,
            // QA-6: nhan o hua "cach nhau bang dau phay" nen phai TACH o day roi
            // gui thanh nhieu tham so `fields`; gui nguyen chuoi la 400.
            fields: fields
              .split(',')
              .map((f) => f.trim())
              .filter(Boolean),
            // API-6: dieu kien loc di qua query string duoi dang chuoi JSON.
            filter: readFilter.trim(),
          }),
        };
      case 'query':
        return { method: 'POST' as const, url: agentUrl(overview.basePath, '/query'), body: queryBody };
      case 'listDocs':
        return { method: 'GET' as const, url: agentUrl(overview.basePath, '/docs') };
      case 'getDoc':
        return { method: 'GET' as const, url: agentUrl(overview.basePath, `/docs/${encodeURIComponent(slug)}`) };
      default:
        return { method: 'GET' as const, url: agentUrl(overview.basePath, '/tables') };
    }
  }, [capability, overview.basePath, table, limit, cursor, fields, readFilter, slug, queryBody]);

  const curl = buildCurl({
    method: request.method,
    url: request.url,
    authHeader: overview.authHeader,
    body: 'body' in request ? request.body : undefined,
    key: showRealKey ? key : undefined,
  });

  const handleRun = async () => {
    setRunning(true);
    const apiKey = key || (await ensureKey());
    if (apiKey && apiKey !== key) setKey(apiKey);
    const res = await callAgent({
      method: request.method,
      url: request.url,
      apiKey,
      authHeader: overview.authHeader,
      body: 'body' in request ? request.body : undefined,
    });
    setResult(res);
    setRunning(false);
  };

  const handleRealKeyToggle = async (checked: boolean) => {
    if (checked && !key) setKey(await ensureKey());
    setShowRealKey(checked);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800 p-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('try.capability')}</span>
            <select
              value={capability}
              onChange={(e) => setCapability(e.target.value as CapabilityKey)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {CAPABILITIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.method} {c.pattern} — {t(`capabilities.${c.key}`)}
                </option>
              ))}
            </select>
          </label>

          {capability === 'readRows' ? (
            <>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('try.table')}</span>
                <select
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {overview.tables.map((tb) => (
                    <option key={tb.key} value={tb.key}>
                      {tb.key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('try.limit')}</span>
                <Input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('try.cursor')}</span>
                <Input value={cursor} onChange={(e) => setCursor(e.target.value)} />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('try.fields')}</span>
                <Input value={fields} onChange={(e) => setFields(e.target.value)} placeholder="productionId,status" />
              </label>
              {/* API-14: nang luc loc cua API-6 phai dung duoc TU TRANG, khong bat mo terminal. */}
              <div className="space-y-2 sm:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('try.filterSamples')}:</span>
                  {Object.keys(READ_FILTER_SAMPLES).map((k) => (
                    <Button key={k} variant="outline" size="sm" type="button" onClick={() => setReadFilter(READ_FILTER_SAMPLES[k])}>
                      {t(`try.${k}`)}
                    </Button>
                  ))}
                </div>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('try.readFilter')}</span>
                  <Textarea
                    value={readFilter}
                    onChange={(e) => setReadFilter(e.target.value)}
                    rows={4}
                    className="font-mono text-xs"
                    placeholder={'{ "status": { "$eq": "Ready" } }'}
                  />
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('try.readFilterHint')}</p>
              </div>
            </>
          ) : null}

          {capability === 'getDoc' ? (
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('try.slug')}</span>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="data-dictionary" />
            </label>
          ) : null}
        </div>

        {capability === 'query' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('try.samples')}:</span>
              {Object.keys(QUERY_SAMPLES).map((k) => (
                <Button key={k} variant="outline" size="sm" type="button" onClick={() => setQueryBody(QUERY_SAMPLES[k])}>
                  {t(`try.${k}`)}
                </Button>
              ))}
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('try.queryBody')}</span>
              <Textarea
                value={queryBody}
                onChange={(e) => setQueryBody(e.target.value)}
                rows={9}
                className="font-mono text-xs"
              />
            </label>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {spec.method} {request.url}
          </p>
          <Button onClick={() => void handleRun()} disabled={running || !overview.keyConfigured}>
            {running ? <Spinner size={14} /> : <Play size={14} />}
            <span className="ml-1.5">{running ? t('try.running') : t('try.run')}</span>
          </Button>
        </div>

        {!overview.keyConfigured ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {t('try.disabledNoKey', { env: overview.keyEnvName })}
          </p>
        ) : null}
      </section>

      <ResultPanel result={result} running={running} />

      <section className="rounded-2xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('try.curlTitle')}</h3>
          <CopyButton value={curl} label="curl" />
        </div>
        <pre className="overflow-x-auto rounded-xl bg-slate-50 dark:bg-slate-900 p-4 font-mono text-xs text-slate-700 dark:text-slate-200">
          {curl}
        </pre>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showRealKey}
            onChange={(e) => void handleRealKeyToggle(e.target.checked)}
            disabled={!overview.keyConfigured}
          />
          {t('try.curlWithKey')}
        </label>
      </section>
    </div>
  );
}

/** Bon trang thai ket qua, phan biet duoc BANG MAT (AC-08, AC-12, AC-13, AC-14). */
function ResultPanel({ result, running }: { result: AgentCallResult | null; running: boolean }) {
  const { t } = useTranslation('agentApi');

  if (running) {
    return (
      <section className="flex items-center justify-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800 p-8 text-slate-500 dark:text-slate-400">
        <Spinner size={18} />
        {t('try.running')}
      </section>
    );
  }

  if (!result) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {t('try.idle')}
      </section>
    );
  }

  const isTimeout = result.errorCode === AGENT_ERROR_CODES.queryTimeout;
  const isNetwork = result.status === 0;
  const isEmptySuccess = result.ok && result.rowCount === 0;

  const tone = result.ok
    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
    : isTimeout
      ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
      : 'bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-300 border-red-200 dark:border-red-500/30';

  const truncated = result.bodyText.length > DISPLAY_LIMIT;
  const shown = truncated ? result.bodyText.slice(0, DISPLAY_LIMIT) : result.bodyText;

  return (
    <section className="rounded-2xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800 overflow-hidden">
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-3 text-sm font-semibold', tone)}>
        {result.ok ? <CheckCircle2 size={16} /> : isTimeout ? <Clock size={16} /> : isNetwork ? <WifiOff size={16} /> : <AlertTriangle size={16} />}
        <span>
          {isNetwork ? '—' : result.status}
          {result.errorCode ? ` · ${result.errorCode}` : ''}
        </span>
        {result.rowCount !== undefined ? <span className="font-normal">{t('try.rows', { n: result.rowCount })}</span> : null}
        <span className="font-normal">{result.durationMs} ms</span>
      </div>

      <div className="space-y-3 p-5">
        {isEmptySuccess ? (
          <p className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
            {t('try.emptySuccess')}
          </p>
        ) : null}

        {isNetwork ? (
          <p className="rounded-lg bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-300">
            {t('try.networkError')}
            {result.errorMessage ? <span className="block font-mono text-xs opacity-80">{result.errorMessage}</span> : null}
          </p>
        ) : null}

        {/* AC-08: thong diep GOC cua bo API, khong dien giai lai. */}
        {result.errorMessage && !isNetwork ? (
          <p className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 font-mono text-xs text-slate-700 dark:text-slate-200">
            {result.errorMessage}
          </p>
        ) : null}

        {result.errorCode ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t(`errors.${result.errorCode}`, { defaultValue: '' })}</p>
        ) : null}

        {result.bodyText ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <CopyButton value={result.bodyText} label="JSON" />
            </div>
            <pre className="max-h-[55vh] overflow-auto rounded-xl bg-slate-50 dark:bg-slate-900 p-4 font-mono text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
              {shown}
            </pre>
            {truncated ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {result.rowCount !== undefined
                  ? t('try.truncated', { n: result.rowCount })
                  : t('try.truncatedNoCount')}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
