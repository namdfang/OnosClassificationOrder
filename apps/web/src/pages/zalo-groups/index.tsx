import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Link2, Link2Off, MessageSquare, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { ZaloGroupLink } from 'shared';
import { ZALO_GROUP_KINDS, ZaloGroupKind } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { LoadingOverlay } from '@/components/common/LoadingOverlay';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import SuggestionsDialog from './SuggestionsDialog';
import SummariesPanel from './SummariesPanel';
import ZaloGroupEditDialog from './ZaloGroupEditDialog';

/** Màu badge theo phân loại — dùng chung cho bảng lẫn ô sửa. */
export const KIND_BADGE_CLASS: Record<ZaloGroupKind, string> = {
  [ZaloGroupKind.Unreviewed]: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  [ZaloGroupKind.Seller]: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  [ZaloGroupKind.Operation]: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  [ZaloGroupKind.Internal]: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

interface Coverage {
  totalGroups: number;
  byKind: Record<string, number>;
  linkedGroups: number;
  customersWithGroup: number;
  customersWithoutGroup: number;
  totalCustomers: number;
}

type Row = ZaloGroupLink & { _id: string; customer?: { _id: string; userSku?: string; fullName?: string } };

const PAGE_SIZE = 30;

export default function ZaloGroupsPage() {
  const { t } = useTranslation(['zaloGroups', 'common']);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [suggestionCount, setSuggestionCount] = useState(0);

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<ZaloGroupKind | ''>('');
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);

  const [editing, setEditing] = useState<Row | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tab, setTab] = useState<'groups' | 'summary'>('groups');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(PAGE_SIZE));
    if (search.trim()) p.set('search', search.trim());
    if (kind) p.set('kind', kind);
    if (unlinkedOnly) p.set('unlinked', 'true');

    return `?${p.toString()}`;
  }, [page, search, kind, unlinkedOnly]);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await RepositoryRemote.zaloGroup.getGroups(query);
      setRows(res.data?.data ?? []);
      setTotal(res.data?.total ?? 0);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  }, [query]);

  /** Phủ sóng + số gợi ý tải riêng: chúng không đổi theo bộ lọc bảng. */
  const loadSummary = useCallback(async () => {
    try {
      const [cov, sug] = await Promise.all([
        RepositoryRemote.zaloGroup.getCoverage(),
        RepositoryRemote.zaloGroup.getSuggestions(),
      ]);
      setCoverage(cov.data?.data ?? null);
      setSuggestionCount((sug.data?.data ?? []).length);
    } catch (error) {
      handleAxiosError(error);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const refreshAll = useCallback(() => {
    void loadGroups();
    void loadSummary();
  }, [loadGroups, loadSummary]);

  const unreviewed = coverage?.byKind?.[ZaloGroupKind.Unreviewed] ?? 0;

  return (
    <div className="space-y-5 p-5">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MessageSquare className="h-5 w-5 text-primary-500" />
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            {t('common:refresh', { defaultValue: 'Làm mới' })}
          </Button>
          <Button size="sm" disabled={suggestionCount === 0} onClick={() => setShowSuggestions(true)}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            {t('suggestions.button', { count: suggestionCount })}
          </Button>
        </div>
      </div>

      {/* Bảng phủ sóng — trả lời "còn bao nhiêu chưa xong" ngay khi mở trang. */}
      {coverage && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-slate-200 dark:bg-slate-700 sm:grid-cols-3 lg:grid-cols-5">
          <StatCell label={t('coverage.totalGroups')} value={coverage.totalGroups} />
          <StatCell label={t('coverage.unreviewed')} value={unreviewed} tone={unreviewed > 0 ? 'warn' : undefined} />
          <StatCell label={t('coverage.linkedGroups')} value={coverage.linkedGroups} tone="good" />
          <StatCell
            label={t('coverage.customersWithGroup')}
            value={coverage.customersWithGroup}
            hint={t('coverage.ofTotal', { total: coverage.totalCustomers })}
          />
          <StatCell
            label={t('coverage.customersWithoutGroup')}
            value={coverage.customersWithoutGroup}
            tone={coverage.customersWithoutGroup > 0 ? 'warn' : undefined}
          />
        </div>
      )}

      {/* Hai góc nhìn cùng một dữ liệu: gắn nhóm (việc thiết lập) và tình hình
          (việc theo dõi hằng ngày). Tách tab để người vào đúng việc của mình. */}
      <div className="flex gap-1 border-b">
        {(['groups', 'summary'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === k
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {t(`tab.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'summary' && <SummariesPanel />}

      {tab === 'groups' && (
      <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="w-64 pl-8"
            placeholder={t('filter.search')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <select
          className="h-9 rounded-md border border-slate-200 bg-transparent px-2 text-sm dark:border-slate-700"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as ZaloGroupKind | '');
            setPage(1);
          }}
        >
          <option value="">{t('kind.all')}</option>
          {ZALO_GROUP_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kind.${k}`)}
            </option>
          ))}
        </select>

        <Button
          variant={unlinkedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setUnlinkedOnly((v) => !v);
            setPage(1);
          }}
        >
          {unlinkedOnly ? <Link2Off className="mr-1.5 h-4 w-4" /> : <Link2 className="mr-1.5 h-4 w-4" />}
          {unlinkedOnly ? t('filter.unlinkedOnly') : t('filter.allGroups')}
        </Button>
      </div>

      <LoadingOverlay active={loading} className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.group')}</TableHead>
              <TableHead>{t('table.kind')}</TableHead>
              <TableHead>{t('table.customer')}</TableHead>
              <TableHead>{t('table.lastMessage')}</TableHead>
              <TableHead className="text-right">{t('table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                  {t('table.empty')}
                </TableCell>
              </TableRow>
            )}

            {rows.map((r) => (
              <TableRow key={r._id}>
                <TableCell>
                  <div className="font-medium">{r.title || t('table.noTitle')}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {t('table.conversations', { count: r.conversationIds?.length ?? 0 })}
                    {r.memberNicks?.length > 0 && <> · {r.memberNicks.join(', ')}</>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={cn('font-normal', KIND_BADGE_CLASS[r.kind])}>{t(`kind.${r.kind}`)}</Badge>
                </TableCell>
                <TableCell>
                  {r.userSku ? (
                    <span className="font-mono text-sm">{r.userSku}</span>
                  ) : (
                    <span className="text-sm text-slate-400">{t('table.noCustomer')}</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-slate-500">
                  {r.lastMessageAt ? dayjs(r.lastMessageAt).format('DD/MM/YYYY') : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                    {t('edit.title')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </LoadingOverlay>

      <PaginationBar
        position="bottom"
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        loading={loading}
        onChange={(p) => setPage(p)}
      />
      </>
      )}

      {editing && (
        <ZaloGroupEditDialog
          group={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refreshAll();
          }}
        />
      )}

      {showSuggestions && (
        <SuggestionsDialog
          onClose={() => setShowSuggestions(false)}
          onApplied={(n) => {
            toast.success(t('suggestions.applied', { count: n }));
            setShowSuggestions(false);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="bg-white p-3 dark:bg-slate-900">
      <div
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {label}
        {hint && <span className="ml-1 text-slate-400">{hint}</span>}
      </div>
    </div>
  );
}
