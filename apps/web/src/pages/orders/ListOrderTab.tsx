import React, { memo, useCallback, useEffect, useState } from 'react';
import { History, Trash2, Image as ImageIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Spinner } from '@/components/common/Spinner';
import { PaginationBar } from '@/components/common/PaginationBar';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { DesignThumbsCell } from '@/components/orders/cells/DesignThumbsCell';
import { OrderLogTimelineDialog } from '@/components/orders/OrderLogTimelineDialog';
import { CopyButton } from '@/components/common/CopyButton';
import { Hint } from '@/components/common/Hint';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SelectFilter } from '@/components/common/SelectFilter';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import { formatDate } from '@/utils/date';
import { smallThumb } from '@/utils/driveThumb';
import { usePermission } from '@/hooks/usePermission';
import { usePendingDesignsPoll } from '@/hooks/usePendingDesignsPoll';

import { DesignerSummaryPanel } from './DesignerSummaryPanel';

type FilterOption = { value: string; label: string; count: number };

interface DesignFields {
  front?: string;
  back?: string;
  sleeve?: string;
  hood?: string;
  folder?: string;
  placket?: string;
  chestLeft?: string;
  chestRight?: string;
  left?: string;
  right?: string;
  sleeveLeft?: string;
  sleeveRight?: string;
  leftUpperSleeve?: string;
  rightUpperSleeve?: string;
  leftCuff?: string;
  rightCuff?: string;
  frontEmbroidery?: string;
  backEmbroidery?: string;
}

interface OrderRow {
  _id: string;
  productionId: string;
  userSku?: string;
  userEmail?: string;
  type?: string;
  color?: string;
  size?: string;
  mockupUrl?: string;
  mockupOriginalUrl?: string;
  printMethod?: string;
  quantity?: number;
  baseCost?: number;
  shipCost?: number;
  status?: string;
  orderId?: string;
  externalId?: string;
  isMapped: boolean;
  factory?: { name: string; shortName: string };
  machineType?: { name: string; shortName: string };
  orderAt?: string;
  inProductionAt?: string;
  designs?: DesignFields;
  designsOriginal?: DesignFields;
  designsStatus?: Partial<Record<keyof DesignFields, 'pending' | 'ready' | 'failed'>>;
}

interface ListOrderTabProps {
  refreshKey: number;
}

const DEFAULT_PAGE_SIZE = 20;


interface OrderRowItemProps {
  it: OrderRow;
  onPreview: (url: string, title: string, originalUrl?: string) => void;
  onDelete: (id: string) => void;
  onHistory: (id: string, productionId: string) => void;
}

const OrderRowItem = memo(
  function OrderRowItem({ it, onPreview, onDelete, onHistory }: OrderRowItemProps) {
    const variantBits = [it.color, it.size, it.printMethod].filter(Boolean);
    const mockupThumbSrc = smallThumb(it.mockupUrl, 200);

    return (
      <TableRow>
        {/* Order ID */}
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <CopyButton value={it.productionId} label="Production ID" />
              <Hint content="Production ID">
                <span className="font-mono text-xs font-semibold text-foreground cursor-help">
                  {it.productionId}
                </span>
              </Hint>
            </div>
            {it.orderId && (
              <div className="flex items-center gap-1">
                <CopyButton value={it.orderId} label="Order ID" iconSize={10} />
                <Hint content="Order ID — mã đơn hàng">
                  <span className="font-mono text-[11px] text-muted-foreground cursor-help">#{it.orderId}</span>
                </Hint>
              </div>
            )}
            {it.externalId && (
              <div className="flex items-center gap-1">
                <CopyButton value={it.externalId} label="Platform ID" iconSize={10} />
                <Hint content={`Platform ID (External): ${it.externalId}`}>
                  <span className="font-mono text-[10px] text-muted-foreground/70 truncate max-w-[140px] cursor-help">
                    ext: {it.externalId}
                  </span>
                </Hint>
              </div>
            )}
            {it.orderAt && (
              <Hint content={`Khách lên đơn: ${formatDate(it.orderAt, 'HH:mm DD/MM/YYYY')}`}>
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 cursor-help">
                  <span className="opacity-60">🛒</span>
                  {formatDate(it.orderAt, 'HH:mm DD/MM/YYYY')}
                </span>
              </Hint>
            )}
          </div>
        </TableCell>

        {/* Mockup */}
        <TableCell>
          {it.mockupUrl ? (
            <Hint content="Click để xem ảnh đầy đủ">
              <button
                type="button"
                onClick={() => onPreview(it.mockupUrl!, `Mockup — ${it.productionId}`, it.mockupOriginalUrl)}
                className="bg-transparent border-none p-0 cursor-pointer"
              >
                <img
                  src={mockupThumbSrc}
                  alt="mockup"
                  className="w-12 h-12 object-contain rounded border border-border bg-checker bg-checker-sm hover:ring-2 hover:ring-ring transition-all"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </button>
            </Hint>
          ) : (
            <div className="w-12 h-12 rounded border border-border bg-muted flex items-center justify-center text-muted-foreground">
              <ImageIcon size={16} />
            </div>
          )}
        </TableCell>

        {/* Designs */}
        <TableCell>
          <DesignThumbsCell
            designs={it.designs as Record<string, string | undefined> | undefined}
            designsOriginal={it.designsOriginal as Record<string, string | undefined> | undefined}
            designsStatus={it.designsStatus}
            productionId={it.productionId}
            openPreview={onPreview}
          />
        </TableCell>

        {/* Product */}
        <TableCell className="max-w-[300px]">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 min-w-0">
              {it.type && <CopyButton value={it.type} label="tên sản phẩm" />}
              <Hint content={it.type || 'Chưa có tên sản phẩm'}>
                <span className="text-sm font-semibold text-foreground truncate cursor-help min-w-0">
                  {it.type || '—'}
                </span>
              </Hint>
            </div>
            {variantBits.length > 0 && (
              <Hint content="Color / Size / Print Method">
                <span className="text-[11px] text-muted-foreground cursor-help">{variantBits.join(' / ')}</span>
              </Hint>
            )}
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
              <Hint content="Số lượng">
                <span className="cursor-help">
                  Qty: <span className="font-medium text-foreground">{it.quantity ?? 1}</span>
                </span>
              </Hint>
              {typeof it.baseCost === 'number' && (
                <Hint content="Base cost — giá gốc sản phẩm">
                  <span className="cursor-help">
                    · Base: <span className="font-medium text-foreground">${it.baseCost}</span>
                  </span>
                </Hint>
              )}
              {typeof it.shipCost === 'number' && (
                <Hint content="Ship cost — phí vận chuyển">
                  <span className="cursor-help">
                    · Ship: <span className="font-medium text-foreground">${it.shipCost}</span>
                  </span>
                </Hint>
              )}
            </span>
          </div>
        </TableCell>

        {/* SKU / Email */}
        <TableCell>
          <div className="flex flex-col gap-0.5">
            {it.userSku ? (
              <div className="flex items-center gap-1">
                <CopyButton value={it.userSku} label="SKU" iconSize={10} />
                <Hint content="User SKU — mã khách hàng">
                  <span className="text-xs font-medium cursor-help">{it.userSku}</span>
                </Hint>
              </div>
            ) : (
              <span className="text-xs font-medium">—</span>
            )}
            {it.userEmail && (
              <div className="flex items-center gap-1">
                <CopyButton value={it.userEmail} label="email" iconSize={10} />
                <Hint content={it.userEmail}>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[140px] cursor-help">
                    {it.userEmail}
                  </span>
                </Hint>
              </div>
            )}
          </div>
        </TableCell>

        {/* Xưởng / Máy */}
        <TableCell>
          {it.isMapped ? (
            <div className="flex flex-col gap-1">
              <Hint content={`Xưởng: ${it.factory?.name} (mã: ${it.factory?.shortName})`}>
                <Badge variant="success" className="w-fit cursor-help">
                  {it.factory?.shortName || '?'} · {it.factory?.name || '?'}
                </Badge>
              </Hint>
              <Hint content={`Loại máy: ${it.machineType?.name} (mã: ${it.machineType?.shortName})`}>
                <Badge variant="secondary" className="w-fit cursor-help">
                  {it.machineType?.shortName || '?'} · {it.machineType?.name || '?'}
                </Badge>
              </Hint>
            </div>
          ) : (
            <Hint content="Type của order không match với product config nào — chưa xác định được xưởng/máy">
              <Badge variant="warning" className="cursor-help">
                Chưa mapping
              </Badge>
            </Hint>
          )}
        </TableCell>

        {/* Status */}
        <TableCell>
          {it.status ? (
            <Hint content={`Trạng thái production: ${it.status}`}>
              <Badge variant="outline" className="cursor-help">
                {it.status}
              </Badge>
            </Hint>
          ) : (
            '—'
          )}
        </TableCell>

        {/* Action */}
        <TableCell>
          <div className="flex items-center gap-0.5">
            <Hint content="Lịch sử thay đổi">
              <Button variant="ghost" size="icon" onClick={() => onHistory(it._id, it.productionId)}>
                <History size={14} className="text-muted-foreground" />
              </Button>
            </Hint>
            <Hint content="Xoá order này">
              <Button variant="ghost" size="icon" onClick={() => onDelete(it._id)}>
                <Trash2 size={14} className="text-destructive" />
              </Button>
            </Hint>
          </div>
        </TableCell>
      </TableRow>
    );
  },
  (prev, next) =>
    prev.it === next.it &&
    prev.onPreview === next.onPreview &&
    prev.onDelete === next.onDelete &&
    prev.onHistory === next.onHistory,
);

export function ListOrderTab({ refreshKey }: ListOrderTabProps) {
  // URL params (prefix `l` = list). F5 giữ nguyên filter — default values
  // bị strip khỏi URL để URL gọn khi chưa filter gì.
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(() => searchParams.get('lsearch') || '');
  const [filterMapped, setFilterMapped] = useState<'all' | 'mapped' | 'unmapped'>(() => {
    const v = searchParams.get('lmapped');
    return v === 'mapped' || v === 'unmapped' ? v : 'all';
  });
  const [filterError, setFilterError] = useState<boolean>(
    () => searchParams.get('lerror') === 'true',
  );
  // Designer summary filters — Admin / Leader.
  const [filterAssignee, setFilterAssignee] = useState<string>(
    () => searchParams.get('lassign') || '',
  );
  const [filterDesignerStatus, setFilterDesignerStatus] = useState<string>(
    () => searchParams.get('ldstatus') || '',
  );
  const [filterOptions, setFilterOptions] = useState<{
    assignee: FilterOption[];
    designerStatus: FilterOption[];
  }>({ assignee: [], designerStatus: [] });
  const { has } = usePermission();
  const canSeeDesignerSummary = has('page.designer_stats') || has('designer.task.assign');

  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('lpage'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const s = Number(searchParams.get('lsize'));
    return Number.isFinite(s) && s > 0 ? s : DEFAULT_PAGE_SIZE;
  });
  const [preview, setPreview] = useState<{ url: string; originalUrl?: string; title: string; sourceUrl?: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; productionId: string } | null>(null);

  // Sync state → URL. Strip default values để URL gọn.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        search ? sp.set('lsearch', search) : sp.delete('lsearch');
        filterMapped !== 'all' ? sp.set('lmapped', filterMapped) : sp.delete('lmapped');
        filterError ? sp.set('lerror', 'true') : sp.delete('lerror');
        filterAssignee ? sp.set('lassign', filterAssignee) : sp.delete('lassign');
        filterDesignerStatus ? sp.set('ldstatus', filterDesignerStatus) : sp.delete('ldstatus');
        page > 1 ? sp.set('lpage', String(page)) : sp.delete('lpage');
        pageSize !== DEFAULT_PAGE_SIZE ? sp.set('lsize', String(pageSize)) : sp.delete('lsize');
        return sp;
      },
      { replace: true },
    );
  }, [search, filterMapped, filterError, filterAssignee, filterDesignerStatus, page, pageSize, setSearchParams]);

  /** Build filter params dùng cho cả fetchData, fetchFilters, summary panel. */
  const buildFilterParams = (): URLSearchParams => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterMapped === 'mapped') params.set('isMapped', 'true');
    if (filterMapped === 'unmapped') params.set('isMapped', 'false');
    if (filterError) params.set('hasError', 'true');
    if (filterAssignee) params.set('assignee', filterAssignee);
    if (filterDesignerStatus) params.set('designerStatus', filterDesignerStatus);
    return params;
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = buildFilterParams();
      params.set('page', String(page));
      params.set('limit', String(pageSize));
      const resp = await RepositoryRemote.order.getOrders(`?${params.toString()}`);
      setItems(resp.data.data || []);
      setTotal(resp.data.total || 0);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFilters = async () => {
    if (!canSeeDesignerSummary) return;
    try {
      const params = buildFilterParams();
      const res = await RepositoryRemote.order.getWorkshopFilters(`?${params.toString()}`);
      const data = (res.data?.data || {}) as {
        assignee?: FilterOption[];
        designerStatus?: FilterOption[];
      };
      setFilterOptions({
        assignee: data.assignee || [],
        designerStatus: data.designerStatus || [],
      });
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    fetchData();
    fetchFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    refreshKey,
    filterMapped,
    filterError,
    filterAssignee,
    filterDesignerStatus,
    page,
    pageSize,
  ]);

  // Skip lần render đầu — nếu không sẽ ghi đè `lpage` đọc từ URL khi F5.
  const isFirstRender = React.useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [filterMapped, filterError, filterAssignee, filterDesignerStatus]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Xoá order này?')) return;
      try {
        await RepositoryRemote.order.deleteOrder(id);
        toast.success('Đã xoá');
        fetchData();
      } catch (error) {
        handleAxiosError(error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const openPreview = useCallback(
    (url: string, title: string, originalUrl?: string, sourceUrl?: string) =>
      setPreview({ url, originalUrl, title, sourceUrl }),
    [],
  );

  const patchRow = useCallback(
    (id: string, patch: Partial<OrderRow>) =>
      setItems((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r))),
    [],
  );
  usePendingDesignsPoll(items as Array<{ _id: string; designs?: Record<string, string | undefined>; designsStatus?: Partial<Record<string, 'pending' | 'ready' | 'failed'>> }>, patchRow);

  const openHistory = useCallback(
    (id: string, productionId: string) => setHistoryTarget({ id, productionId }),
    [],
  );

  const paginationProps = {
    page,
    pageSize,
    total,
    loading,
    onChange: (p: number, ps: number) => {
      setPage(p);
      setPageSize(ps);
    },
  };

  // Inject "Chưa gán" option vào assignee.
  const assigneeOptions = canSeeDesignerSummary
    ? filterOptions.assignee.find((o) => o.value === '__none__')
      ? filterOptions.assignee
      : [{ value: '__none__', label: 'Chưa gán', count: 0 }, ...filterOptions.assignee]
    : [];

  const summaryFilterQs = buildFilterParams().toString();

  /** Click cell trong panel → set filter list. */
  const handleSummaryCellClick = (
    userId: string | null,
    status:
      | 'assigned'
      | 'in-progress'
      | 'done'
      | 'rejected'
      | 'rework'
      | 'unassigned'
      | null,
  ) => {
    if (userId !== null) setFilterAssignee(userId);
    if (status !== null) setFilterDesignerStatus(status);
    setPage(1);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {canSeeDesignerSummary && (
          <DesignerSummaryPanel
            filterQs={summaryFilterQs}
            onClickCell={handleSummaryCellClick}
          />
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Input
            placeholder="Tìm Production ID, Order ID, SKU, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              variant={filterMapped === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterMapped('all')}
            >
              Tất cả
            </Button>
            <Button
              variant={filterMapped === 'mapped' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterMapped('mapped')}
            >
              Đã mapping
            </Button>
            <Button
              variant={filterMapped === 'unmapped' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterMapped('unmapped')}
            >
              Chưa mapping
            </Button>
            <Button
              variant={filterError ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => setFilterError((v) => !v)}
              title="Chỉ hiện đơn xưởng đã báo lỗi"
            >
              Lỗi xưởng
            </Button>
          </div>
        </div>

        {canSeeDesignerSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 rounded-md border border-border bg-card p-2.5">
            <SelectFilter
              label="Designer"
              value={filterAssignee}
              onChange={setFilterAssignee}
              options={assigneeOptions}
            />
            <SelectFilter
              label="TT Designer"
              value={filterDesignerStatus}
              onChange={setFilterDesignerStatus}
              options={filterOptions.designerStatus}
            />
            {(filterAssignee || filterDesignerStatus) && (
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterAssignee('');
                    setFilterDesignerStatus('');
                  }}
                >
                  Xoá filter designer
                </Button>
              </div>
            )}
          </div>
        )}

        <PaginationBar position="top" {...paginationProps} />

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Order ID</TableHead>
                <TableHead className="w-16">Mockup</TableHead>
                <TableHead className="min-w-[110px]">Design</TableHead>
                <TableHead className="min-w-[260px]">Product</TableHead>
                <TableHead>SKU / Email</TableHead>
                <TableHead>Xưởng / Máy</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10">
                    <Spinner size={20} className="text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                    Chưa có order nào. Sang tab "Import Order" để thêm.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                items.map((it) => (
                  <OrderRowItem
                    key={it._id}
                    it={it}
                    onPreview={openPreview}
                    onDelete={handleDelete}
                    onHistory={openHistory}
                  />
                ))}
            </TableBody>
          </Table>

          <PaginationBar position="bottom" {...paginationProps} />
        </div>

        <ImagePreviewDialog
          open={!!preview}
          onOpenChange={(open) => !open && setPreview(null)}
          url={preview?.url}
          originalUrl={preview?.originalUrl}
          title={preview?.title}
          ensurePreviewSource={preview?.sourceUrl}
        />

        <OrderLogTimelineDialog
          open={!!historyTarget}
          onOpenChange={(open) => !open && setHistoryTarget(null)}
          orderId={historyTarget?.id}
          productionId={historyTarget?.productionId}
        />
      </div>
    </TooltipProvider>
  );
}
