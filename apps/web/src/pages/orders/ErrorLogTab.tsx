import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, History } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { WorkshopConfigCategory } from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { OrderFilterBar, type OrderFilterFacet } from '@/components/orders/OrderFilterBar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OrderLogTimelineDialog } from '@/components/orders/OrderLogTimelineDialog';
import { OrderRowActionsMenu } from '@/components/orders/OrderRowActionsMenu';
import { HeldBadge } from '@/components/orders/HeldBadge';
import { CancelledBadge } from '@/components/orders/CancelledBadge';
import { isCancelled, isHeld } from '@/utils/orderActions';
import {
  WORKSHOP_COLS,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { usePermission } from '@/hooks/usePermission';
import { usePendingDesignsPoll } from '@/hooks/usePendingDesignsPoll';
import { RepositoryRemote } from '@/services';
import { useDesignerTeamStore } from '@/store/designerTeamStore';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/utils/cn';
import { NO_TOOL_ROW_CLASS, useIsNoTool } from '@/hooks/useIsNoTool';

type ErrorLogRow = WorkshopOrderRow & { productionFirstErrorAt?: string };
type UrgencyKey = 'new' | 'attention' | 'urgent' | 'critical';

const DEFAULT_PAGE_SIZE = 30;

const URGENCY_META: Record<
  UrgencyKey,
  { label: string; cls: string; chipCls: string; ringCls: string }
> = {
  new: {
    label: 'Mới',
    cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    chipCls: 'bg-sky-50 border-sky-300 text-sky-700',
    ringCls: 'ring-sky-200',
  },
  attention: {
    label: 'Cần làm',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    chipCls: 'bg-amber-50 border-amber-300 text-amber-700',
    ringCls: 'ring-amber-200',
  },
  urgent: {
    label: 'Gấp',
    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    chipCls: 'bg-orange-50 border-orange-300 text-orange-700',
    ringCls: 'ring-orange-200',
  },
  critical: {
    label: 'Khẩn cấp',
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 animate-pulse',
    chipCls: 'bg-rose-50 border-rose-300 text-rose-700',
    ringCls: 'ring-rose-200',
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Mức độ khẩn cấp tính theo tuổi đơn kể từ ngày VÀO SẢN XUẤT (`inProductionAt`),
// KHÔNG phải ngày báo lỗi.
function urgencyOf(dateStr?: string): UrgencyKey {
  if (!dateStr) return 'new';
  const age = Date.now() - new Date(dateStr).getTime();
  if (age < DAY_MS) return 'new';
  if (age < 2 * DAY_MS) return 'attention';
  if (age < 3 * DAY_MS) return 'urgent';
  return 'critical';
}

function formatDuration(dateStr?: string): string {
  if (!dateStr) return '—';
  const age = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(age / DAY_MS);
  const hours = Math.floor((age % DAY_MS) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((age % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDayOnly(d?: string): string {
  if (!d) return '—';
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

export function ErrorLogTab() {
  const { has, canEditField, canViewField } = usePermission();
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);
  const productionErrorConfigs = useWorkshopConfigStore(
    (s) => s.byCategory[WorkshopConfigCategory.ProductionError],
  );
  const fabricConfigs = useWorkshopConfigStore(
    (s) => s.byCategory[WorkshopConfigCategory.FabricType],
  );
  const toolResultConfigs = useWorkshopConfigStore(
    (s) => s.byCategory[WorkshopConfigCategory.ToolResult],
  );
  const loadDesignerTeam = useDesignerTeamStore((s) => s.fetch);
  const designerMembers = useDesignerTeamStore((s) => s.members);

  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<ErrorLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [byUrgency, setByUrgency] = useState({ new: 0, attention: 0, urgent: 0, critical: 0 });
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('epage'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const s = Number(searchParams.get('esize'));
    return Number.isFinite(s) && s > 0 ? s : DEFAULT_PAGE_SIZE;
  });
  const [search, setSearch] = useState(() => searchParams.get('esearch') || '');
  const debouncedSearch = useDebounce(search, 300);

  // Date range (inProductionAt, VN tz) — đồng bộ với 3 bảng order khác.
  // Default empty (= không filter) thay vì today vì error log thường xem
  // history qua nhiều ngày.
  const [createdFrom, setCreatedFrom] = useState(() => searchParams.get('efrom') || '');
  const [createdTo, setCreatedTo] = useState(() => searchParams.get('eto') || '');

  const [filterAssignee, setFilterAssignee] = useState(() => searchParams.get('eassign') || '');
  const [filterFabric, setFilterFabric] = useState(() => searchParams.get('efabric') || '');
  const [filterTool, setFilterTool] = useState(() => searchParams.get('etool') || '');
  const [filterErrorCode, setFilterErrorCode] = useState(
    () => searchParams.get('ecode') || '',
  );
  const [filterSource, setFilterSource] = useState(() => searchParams.get('esource') || '');
  const [filterUrgency, setFilterUrgency] = useState(() => searchParams.get('eurg') || '');
  const [historyTarget, setHistoryTarget] = useState<{
    id: string;
    productionId: string;
  } | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    originalUrl?: string;
    title: string;
    sourceUrl?: string;
  } | null>(null);

  useEffect(() => {
    if (!configLoaded) loadConfig();
    loadDesignerTeam();
  }, [configLoaded, loadConfig, loadDesignerTeam]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        search ? sp.set('esearch', search) : sp.delete('esearch');
        filterAssignee ? sp.set('eassign', filterAssignee) : sp.delete('eassign');
        filterFabric ? sp.set('efabric', filterFabric) : sp.delete('efabric');
        filterTool ? sp.set('etool', filterTool) : sp.delete('etool');
        filterErrorCode ? sp.set('ecode', filterErrorCode) : sp.delete('ecode');
        filterSource ? sp.set('esource', filterSource) : sp.delete('esource');
        filterUrgency ? sp.set('eurg', filterUrgency) : sp.delete('eurg');
        createdFrom ? sp.set('efrom', createdFrom) : sp.delete('efrom');
        createdTo ? sp.set('eto', createdTo) : sp.delete('eto');
        page > 1 ? sp.set('epage', String(page)) : sp.delete('epage');
        pageSize !== DEFAULT_PAGE_SIZE ? sp.set('esize', String(pageSize)) : sp.delete('esize');
        return sp;
      },
      { replace: true },
    );
  }, [
    search,
    filterAssignee,
    filterFabric,
    filterTool,
    filterErrorCode,
    filterSource,
    filterUrgency,
    createdFrom,
    createdTo,
    page,
    pageSize,
    setSearchParams,
  ]);

  const fetchData = async () => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (filterAssignee) params.set('assignee', filterAssignee);
    if (filterFabric) params.set('fabricType', filterFabric);
    if (filterTool) params.set('toolResult', filterTool);
    if (filterErrorCode) params.set('productionError', filterErrorCode);
    if (filterSource) params.set('productionErrorSource', filterSource);
    if (filterUrgency) params.set('urgency', filterUrgency);
    if (createdFrom) params.set('createdFrom', createdFrom);
    if (createdTo) params.set('createdTo', createdTo);
    params.set('page', String(page));
    params.set('limit', String(pageSize));
    setLoading(true);
    try {
      const res = await RepositoryRemote.order.getErrorLog('?' + params.toString());
      setItems((res.data?.data || []) as ErrorLogRow[]);
      setTotal(Number(res.data?.total || 0));
      setByUrgency(
        (res.data?.byUrgency as typeof byUrgency) || { new: 0, attention: 0, urgent: 0, critical: 0 },
      );
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    pageSize,
    debouncedSearch,
    filterAssignee,
    filterFabric,
    filterTool,
    filterErrorCode,
    filterSource,
    filterUrgency,
    createdFrom,
    createdTo,
  ]);

  const patchRow = (id: string, patch: Partial<ErrorLogRow>) => {
    setItems((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  };

  usePendingDesignsPoll(items, patchRow);

  const openPreview = (url: string, title: string, originalUrl?: string, sourceUrl?: string) =>
    setPreview({ url, originalUrl, title, sourceUrl });

  const renderCtx: WorkshopRenderCtx = { canEditField, patchRow, openPreview };
  const isNoTool = useIsNoTool();

  // Hiển thị bảng đơn giản: productionId, sản phẩm, mockup, người thực hiện,
  // loại vải, tool, lỗi xưởng, source, count. Tận dụng cell editor từ
  // workshopTableConfig.
  const visibleCols = useMemo(
    () =>
      WORKSHOP_COLS.filter((c) =>
        [
          'productionId',
          'mockupTypeSize',
          'designs',
          'fabricType',
          'toolResult',
          'assignee',
          'productionError',
          'productionErrorSource',
        ].includes(c.key),
      ).filter((c) => !c.perm || canViewField(c.key)),
    [canViewField],
  );

  const assigneeOptions = useMemo<Array<{ value: string; label: string; count: number }>>(() => {
    const base = (designerMembers || []).map((m) => ({
      value: String(m._id),
      label: String(m.fullName || m.email || m._id),
      count: 0,
    }));
    return [{ value: '__none__', label: 'Chưa gán', count: 0 }, ...base];
  }, [designerMembers]);

  const fabricOptions = useMemo<Array<{ value: string; label: string; count: number }>>(
    () =>
      (fabricConfigs || []).map((c) => ({
        value: String(c.code),
        label: String(c.name),
        count: 0,
      })),
    [fabricConfigs],
  );

  const toolOptions = useMemo<Array<{ value: string; label: string; count: number }>>(
    () =>
      (toolResultConfigs || []).map((c) => ({
        value: String(c.code),
        label: String(c.name),
        count: 0,
      })),
    [toolResultConfigs],
  );

  const errorCodeOptions = useMemo<Array<{ value: string; label: string; count: number }>>(
    () =>
      (productionErrorConfigs || []).map((c) => ({
        value: String(c.code),
        label: String(c.name),
        count: 0,
      })),
    [productionErrorConfigs],
  );

  const sourceOptions = [
    { value: 'designer', label: 'Lỗi do Designer', count: 0 },
    { value: 'factory', label: 'Lỗi do Xưởng', count: 0 },
  ];

  const toggleUrgency = (key: UrgencyKey) => {
    setFilterUrgency((prev) => (prev === key ? '' : key));
    setPage(1);
  };

  const totalErrors = byUrgency.new + byUrgency.attention + byUrgency.urgent + byUrgency.critical;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-rose-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-foreground">Nhật ký bù lỗi</h2>
              <p className="text-xs text-muted-foreground">
                Đơn đang chờ xử lý lỗi xưởng — sắp xếp theo thời gian lỗi lâu nhất trước. Tổng cộng{' '}
                <span className="font-medium text-foreground">{totalErrors}</span> đơn cần xử lý.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['new', 'attention', 'urgent', 'critical'] as UrgencyKey[]).map((key) => {
              const meta = URGENCY_META[key];
              const active = filterUrgency === key;
              return (
                <button
                  key={key}
                  onClick={() => toggleUrgency(key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                    meta.chipCls,
                    active && 'ring-2 ring-offset-1 ' + meta.ringCls,
                  )}
                  title={
                    {
                      new: '< 24h kể từ khi vào sản xuất',
                      attention: '24h–48h kể từ khi vào sản xuất',
                      urgent: '48h–72h kể từ khi vào sản xuất',
                      critical: '≥ 72h kể từ khi vào sản xuất',
                    }[key]
                  }
                >
                  <span>{meta.label}</span>
                  <span className="font-mono">({byUrgency[key]})</span>
                </button>
              );
            })}
            {filterUrgency && (
              <button
                onClick={() => {
                  setFilterUrgency('');
                  setPage(1);
                }}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                Xóa filter mức độ
              </button>
            )}
          </div>
        </div>

        <OrderFilterBar
          search={search}
          onSearchChange={setSearch}
          createdFrom={createdFrom}
          createdTo={createdTo}
          onDateRangeChange={(f, t) => {
            setCreatedFrom(f);
            setCreatedTo(t);
            setPage(1);
          }}
          onReload={() => fetchData()}
          loading={loading}
          facets={[
            { key: 'assignee', label: 'Người thực hiện', value: filterAssignee, onChange: (v) => { setFilterAssignee(v); setPage(1); }, options: assigneeOptions, perm: 'order.field.assignee.view' },
            { key: 'fabricType', label: 'Loại vải', value: filterFabric, onChange: (v) => { setFilterFabric(v); setPage(1); }, options: fabricOptions, perm: 'order.field.fabricType.view' },
            { key: 'toolResult', label: 'Kết quả Tool', value: filterTool, onChange: (v) => { setFilterTool(v); setPage(1); }, options: toolOptions, perm: 'order.field.toolResult.view' },
            { key: 'productionError', label: 'Mã lỗi', value: filterErrorCode, onChange: (v) => { setFilterErrorCode(v); setPage(1); }, options: errorCodeOptions },
            { key: 'productionErrorSource', label: 'Nguồn lỗi', value: filterSource, onChange: (v) => { setFilterSource(v); setPage(1); }, options: sourceOptions },
          ] satisfies OrderFilterFacet[]}
        />

        <PaginationBar
          position="top"
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loading}
          onChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
        />

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap text-xs w-[140px]">Mức độ</TableHead>
                  <TableHead className="whitespace-nowrap text-xs w-[140px]">Tuổi đơn (từ SX)</TableHead>
                  {visibleCols.map((c) => (
                    <TableHead key={c.key} className={cn('whitespace-nowrap text-xs', c.width)}>
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead className="whitespace-nowrap text-xs w-[80px]">Số lần lỗi</TableHead>
                  <TableHead className="whitespace-nowrap text-xs w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleCols.length + 4} className="text-center py-10">
                      <Spinner size={20} className="text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={visibleCols.length + 4}
                      className="text-center py-10 text-sm text-muted-foreground"
                    >
                      Không có đơn lỗi nào phù hợp 🎉
                    </TableCell>
                  </TableRow>
                )}
                {items.map((row) => {
                  const urg = urgencyOf(row.inProductionAt);
                  const meta = URGENCY_META[urg];
                  const held = isHeld(row);
                  const cancelled = isCancelled(row);
                  const rowCtx = held ? { ...renderCtx, canEditField: () => false } : renderCtx;
                  return (
                    <TableRow
                      key={row._id}
                      className={cn(
                        isNoTool(row.toolResult) && NO_TOOL_ROW_CLASS,
                        (held || cancelled) && 'opacity-60',
                      )}
                    >
                      <TableCell className="py-2">
                        <Badge className={cn('font-mono text-[11px]', meta.cls)}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs font-mono font-semibold text-foreground">
                            {formatDuration(row.inProductionAt)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            vào SX {formatDayOnly(row.inProductionAt)}
                          </span>
                        </div>
                      </TableCell>
                      {visibleCols.map((c) => (
                        <TableCell key={c.key} className="py-2">
                          {c.key === 'productionId' && (held || cancelled) ? (
                            <div className="flex items-center gap-1.5">
                              {cancelled ? (
                                <CancelledBadge reason={row.cancelReason} />
                              ) : (
                                <HeldBadge reason={row.holdReason} />
                              )}
                              <div className="min-w-0 flex-1">{c.render(row, rowCtx)}</div>
                            </div>
                          ) : (
                            c.render(row, rowCtx)
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="py-2 text-center">
                        <Badge
                          variant="secondary"
                          className="font-mono text-[11px] bg-rose-100 text-rose-700"
                        >
                          ×{row.productionErrorCount || 1}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Lịch sử"
                            onClick={() =>
                              setHistoryTarget({ id: row._id, productionId: row.productionId })
                            }
                          >
                            <History size={13} className="text-muted-foreground" />
                          </Button>
                          <OrderRowActionsMenu order={row} onChanged={() => fetchData()} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            position="bottom"
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            onChange={(p, ps) => {
              setPage(p);
              setPageSize(ps);
            }}
          />
        </div>

        <ImagePreviewDialog
          open={!!preview}
          onOpenChange={(o) => !o && setPreview(null)}
          url={preview?.url}
          originalUrl={preview?.originalUrl}
          title={preview?.title}
          ensurePreviewSource={preview?.sourceUrl}
        />

        <OrderLogTimelineDialog
          open={!!historyTarget}
          onOpenChange={(o) => !o && setHistoryTarget(null)}
          orderId={historyTarget?.id}
          productionId={historyTarget?.productionId}
        />
      </div>
    </TooltipProvider>
  );
}
