import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, History, RefreshCw, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { WorkshopConfigCategory } from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/common/PaginationBar';
import { SelectFilter } from '@/components/common/SelectFilter';
import { Spinner } from '@/components/common/Spinner';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
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
import {
  WORKSHOP_COLS,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { usePermission } from '@/hooks/usePermission';
import { RepositoryRemote } from '@/services';
import { useDesignerTeamStore } from '@/store/designerTeamStore';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/utils/cn';

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

function urgencyOf(firstErrorAt?: string): UrgencyKey {
  if (!firstErrorAt) return 'new';
  const age = Date.now() - new Date(firstErrorAt).getTime();
  if (age < DAY_MS) return 'new';
  if (age < 2 * DAY_MS) return 'attention';
  if (age < 3 * DAY_MS) return 'urgent';
  return 'critical';
}

function formatDuration(firstErrorAt?: string): string {
  if (!firstErrorAt) return '—';
  const age = Date.now() - new Date(firstErrorAt).getTime();
  const days = Math.floor(age / DAY_MS);
  const hours = Math.floor((age % DAY_MS) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((age % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(d?: string): string {
  if (!d) return '—';
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  ]);

  const patchRow = (id: string, patch: Partial<ErrorLogRow>) => {
    setItems((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  };

  const openPreview = (url: string, title: string, originalUrl?: string) =>
    setPreview({ url, originalUrl, title });

  const renderCtx: WorkshopRenderCtx = { canEditField, patchRow, openPreview };

  // Hiển thị bảng đơn giản: productionId, sản phẩm, mockup, người thực hiện,
  // loại vải, tool, lỗi xưởng, source, count. Tận dụng cell editor từ
  // workshopTableConfig.
  const visibleCols = useMemo(
    () =>
      WORKSHOP_COLS.filter((c) =>
        ['productionId', 'mockupTypeSize', 'fabricType', 'toolResult', 'assignee', 'productionError', 'productionErrorSource'].includes(
          c.key,
        ),
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
                      new: '< 24h kể từ khi báo lỗi',
                      attention: '24h–48h',
                      urgent: '48h–72h',
                      critical: '≥ 72h',
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

        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={13}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Tìm Production ID / SKU / Order ID / Type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-9 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData()}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Tải lại
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {has('order.field.assignee.view') && (
              <SelectFilter
                label="Người thực hiện"
                value={filterAssignee}
                onChange={(v) => {
                  setFilterAssignee(v);
                  setPage(1);
                }}
                options={assigneeOptions}
              />
            )}
            {has('order.field.fabricType.view') && (
              <SelectFilter
                label="Loại vải"
                value={filterFabric}
                onChange={(v) => {
                  setFilterFabric(v);
                  setPage(1);
                }}
                options={fabricOptions}
              />
            )}
            {has('order.field.toolResult.view') && (
              <SelectFilter
                label="Kết quả Tool"
                value={filterTool}
                onChange={(v) => {
                  setFilterTool(v);
                  setPage(1);
                }}
                options={toolOptions}
              />
            )}
            <SelectFilter
              label="Mã lỗi"
              value={filterErrorCode}
              onChange={(v) => {
                setFilterErrorCode(v);
                setPage(1);
              }}
              options={errorCodeOptions}
            />
            <SelectFilter
              label="Nguồn lỗi"
              value={filterSource}
              onChange={(v) => {
                setFilterSource(v);
                setPage(1);
              }}
              options={sourceOptions}
            />
          </div>
        </div>

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
                  <TableHead className="whitespace-nowrap text-xs w-[140px]">Đã chờ</TableHead>
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
                  const urg = urgencyOf(row.productionFirstErrorAt);
                  const meta = URGENCY_META[urg];
                  return (
                    <TableRow key={row._id}>
                      <TableCell className="py-2">
                        <Badge className={cn('font-mono text-[11px]', meta.cls)}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs font-mono font-semibold text-foreground">
                            {formatDuration(row.productionFirstErrorAt)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            từ {formatDate(row.productionFirstErrorAt)}
                          </span>
                        </div>
                      </TableCell>
                      {visibleCols.map((c) => (
                        <TableCell key={c.key} className="py-2">
                          {c.render(row, renderCtx)}
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
