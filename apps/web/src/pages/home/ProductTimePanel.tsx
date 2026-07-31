import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ImageOff,
  Package,
  Search,
  Timer,
  User,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import type { ProductTimeDesigner, ProductTimeOrderRow, ProductTimeRow } from 'shared';
import { PRODUCT_LEVEL_MAP, PRODUCT_LEVELS } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Hint } from '@/components/common/Hint';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { Spinner } from '@/components/common/Spinner';
import { TooltipProvider } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { usePermission } from '@/hooks/usePermission';

/** Role được gán level sản phẩm — mirror `@Auth` của `PATCH /product-configs/:id` (SuperAdmin auto-pass). */
const LEVEL_EDIT_ROLES = ['SuperAdmin', 'Admin', 'Manager'];

function LevelBadge({ level }: { level: number }) {
  return (
    <span
      className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold text-white tabular-nums"
      style={{ backgroundColor: PRODUCT_LEVEL_MAP[level]?.color }}
    >
      {level}
    </span>
  );
}

interface ProductTimePanelProps {
  from?: string;
  to?: string;
  type?: string;
  customer?: string;
  reloadToken?: number;
  /** Set → chế độ "Xem chi tiết" 1 designer: chỉ số liệu/đơn của người này. */
  designerId?: string;
  designerName?: string;
  onClose: () => void;
}

/**
 * Panel "Xem tất cả" mở từ widget Top Designer: thời gian TB nhận/làm task theo
 * TỪNG loại sản phẩm (toàn bộ designer, cùng kỳ lọc chung). Click 1 sản phẩm →
 * drill gom theo designer (mặc định thu gọn, click từng người để xem đơn).
 */
export function ProductTimePanel({
  from,
  to,
  type,
  customer,
  reloadToken,
  designerId,
  designerName,
  onClose,
}: ProductTimePanelProps) {
  const { t } = useTranslation('dashboard');
  const [rows, setRows] = useState<ProductTimeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [orderRows, setOrderRows] = useState<
    Record<string, { designers: ProductTimeDesigner[]; rows: ProductTimeOrderRow[] }>
  >({});
  const [ordersLoading, setOrdersLoading] = useState(false);
  // Nhóm designer đang mở trong drill — key `${type}::${userId}`, mặc định thu gọn.
  const [openDesigners, setOpenDesigners] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ url: string; title?: string } | null>(null);
  // Filter nội bộ panel: CHỈ search sản phẩm (client-side) — khách hàng ăn
  // theo filter chung của tab (prop `customer`).
  const [searchType, setSearchType] = useState('');
  const { roleName } = usePermission();
  const canEditLevel = LEVEL_EDIT_ROLES.includes(roleName || '');
  // `type` của row đang lưu level — disable control tránh double-submit.
  const [savingType, setSavingType] = useState<string | null>(null);

  const applyLevel = async (row: ProductTimeRow, level: number) => {
    if (!row.productConfigId || savingType !== null) return;
    try {
      setSavingType(row.type);
      await RepositoryRemote.productConfig.updateProductConfig(row.productConfigId, { level });
      setRows((prev) => prev.map((x) => (x.type === row.type ? { ...x, level } : x)));
      toast.success(t('productTimes.levelSaved', { level }));
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSavingType(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setExpanded(null);
        setOrderRows({});
        setOpenDesigners(new Set());
        const res = await RepositoryRemote.designer.productTimeOverview({ from, to, type, customer, designerId });
        setRows(((res.data?.data as { rows?: ProductTimeRow[] } | undefined)?.rows || []) as ProductTimeRow[]);
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [from, to, type, customer, designerId, reloadToken]);

  const visibleRows = useMemo(() => {
    const q = searchType.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.type || t('productTimes.noType')).toLowerCase().includes(q));
  }, [rows, searchType, t]);

  const formatDuration = (mins: number): string => {
    if (mins < 60) return t('topDesigners.durationMin', { count: mins });
    return t('topDesigners.durationHourMin', { hours: Math.floor(mins / 60), mins: mins % 60 });
  };

  const toggleProduct = async (productType: string) => {
    if (expanded === productType) {
      setExpanded(null);
      return;
    }
    setExpanded(productType);
    if (orderRows[productType]) return;
    try {
      setOrdersLoading(true);
      const res = await RepositoryRemote.designer.productTimeOrders({
        type: productType,
        from,
        to,
        customer,
        designerId,
      });
      const data = res.data?.data as { designers?: ProductTimeDesigner[]; rows?: ProductTimeOrderRow[] } | undefined;
      const designers = data?.designers || [];
      setOrderRows((prev) => ({
        ...prev,
        [productType]: { designers, rows: data?.rows || [] },
      }));
      // Chỉ 1 designer (chế độ Xem chi tiết) → tự mở luôn danh sách đơn.
      if (designers.length === 1) {
        const soleKey = `${productType}::${designers[0].userId}`;
        setOpenDesigners((prev) => new Set(prev).add(soleKey));
      }
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const toggleDesigner = (productType: string, userId: string) => {
    const key = `${productType}::${userId}`;
    setOpenDesigners((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Package size={16} className="text-sky-500" />
          <span className="text-sm font-bold">
            {designerId ? t('productTimes.titleDesigner', { name: designerName || '' }) : t('productTimes.title')}
          </span>
          <span className="hidden sm:inline text-xs text-muted-foreground">
            {designerId ? t('productTimes.subtitleDesigner') : t('productTimes.subtitle')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('productTimes.close')}
          >
            <X size={15} />
          </button>
        </div>

        {/* Filter nội bộ: CHỈ search sản phẩm (lọc tại chỗ) — khách theo lọc tổng của tab */}
        <div className="border-b border-border px-4 py-2.5">
          <div className="relative sm:max-w-xs">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              placeholder={t('productTimes.searchProductPlaceholder')}
              className={cn(
                'w-full rounded-md border bg-background py-1.5 pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                searchType ? 'border-primary' : 'border-input',
              )}
            />
          </div>
        </div>

        {loading && rows.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <Spinner size={18} className="text-muted-foreground" />
          </div>
        )}
        {!loading && visibleRows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {rows.length > 0 ? t('productTimes.noMatch') : t('productTimes.empty')}
          </p>
        )}

        {visibleRows.length > 0 && (
          <div className="max-h-[70vh] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{t('productTimes.colProduct')}</th>
                  <th className="px-3 py-2.5 text-center font-medium">{t('productTimes.colLevel')}</th>
                  <th className="px-3 py-2.5 text-center font-medium">{t('productTimes.colSuggest')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('productTimes.colTasks')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t('productTimes.colDone')}</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Zap size={12} className="text-amber-500" /> {t('productTimes.colAvgResponse')}
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Timer size={12} className="text-emerald-500" /> {t('productTimes.colAvgWork')}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const isOpen = expanded === r.type;
                  const drill = orderRows[r.type];
                  return (
                    <React.Fragment key={r.type || '__none__'}>
                      <tr
                        className={cn(
                          'cursor-pointer border-b border-border/60 hover:bg-muted/50 transition-colors',
                          isOpen && 'bg-primary/5',
                        )}
                        onClick={() => toggleProduct(r.type)}
                      >
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                            {isOpen ? (
                              <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight size={15} className="shrink-0 text-muted-foreground" />
                            )}
                            {r.mockupUrl ? (
                              <img
                                src={r.mockupUrl}
                                alt=""
                                loading="lazy"
                                className="h-10 w-10 shrink-0 cursor-zoom-in rounded object-cover"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreview({ url: r.mockupUrl!, title: r.type || undefined });
                                }}
                              />
                            ) : (
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                                <ImageOff size={15} />
                              </span>
                            )}
                            {r.type || t('productTimes.noType')}
                          </span>
                        </td>
                        {/* Level chính thức — ProductConfig.level, Admin/Manager đổi tại chỗ */}
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {canEditLevel && r.productConfigId ? (
                            <select
                              value={r.level ?? ''}
                              disabled={savingType === r.type}
                              onChange={(e) => e.target.value && applyLevel(r, Number(e.target.value))}
                              className={cn(
                                'h-6 cursor-pointer rounded-full border-0 pl-2 pr-1 text-xs font-bold tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50',
                                r.level ? 'text-white' : 'bg-muted text-muted-foreground',
                              )}
                              style={r.level ? { backgroundColor: PRODUCT_LEVEL_MAP[r.level]?.color } : undefined}
                              aria-label={t('productTimes.colLevel')}
                            >
                              <option value="" disabled>
                                —
                              </option>
                              {PRODUCT_LEVELS.map((l) => (
                                <option key={l.value} value={l.value} className="bg-background text-foreground">
                                  {l.value}
                                </option>
                              ))}
                            </select>
                          ) : r.level ? (
                            <LevelBadge level={r.level} />
                          ) : (
                            <span
                              className="text-muted-foreground"
                              title={!r.productConfigId ? t('productTimes.noConfigTip') : undefined}
                            >
                              —
                            </span>
                          )}
                        </td>
                        {/* Gợi ý level — percentile 60 ngày, click để gán (Admin/Manager) */}
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {r.suggestedLevel ? (
                            <Hint
                              forceRich
                              content={
                                <div className="text-xs">
                                  <p className="mb-0.5 font-semibold">{t('productTimes.suggestTipTitle')}</p>
                                  <p>
                                    {t('productTimes.suggestTip', {
                                      done: r.suggestDone,
                                      work: formatDuration(r.suggestAvgWorkMin || 0),
                                      rework: r.suggestReworkPct,
                                    })}
                                  </p>
                                  {canEditLevel && r.productConfigId && r.suggestedLevel !== r.level && (
                                    <p className="mt-0.5 italic">{t('productTimes.suggestApplyTip')}</p>
                                  )}
                                </div>
                              }
                            >
                              {/* KHÔNG dùng attr disabled — giữ hover tooltip căn cứ cho role chỉ-xem */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (canEditLevel && r.suggestedLevel !== r.level) applyLevel(r, r.suggestedLevel!);
                                }}
                                className={cn(
                                  'inline-flex h-6 items-center rounded-full border px-2 text-xs font-bold tabular-nums transition-colors',
                                  r.suggestedLevel === r.level
                                    ? 'opacity-40'
                                    : canEditLevel && r.productConfigId
                                      ? 'cursor-pointer hover:bg-muted'
                                      : 'cursor-default',
                                )}
                                style={{
                                  borderColor: PRODUCT_LEVEL_MAP[r.suggestedLevel]?.color,
                                  color: PRODUCT_LEVEL_MAP[r.suggestedLevel]?.color,
                                }}
                              >
                                → {r.suggestedLevel}
                              </button>
                            </Hint>
                          ) : (
                            <span className="text-muted-foreground" title={t('productTimes.suggestInsufficient')}>
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.taskCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                          {r.doneCount}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.avgResponseMin > 0 ? formatDuration(r.avgResponseMin) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {r.avgWorkMin > 0 ? formatDuration(r.avgWorkMin) : '—'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-border/60">
                          <td colSpan={7} className="bg-muted/30 px-4 py-2.5">
                            {ordersLoading && !drill && (
                              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                                <Spinner size={14} /> {t('productTimes.loadingOrders')}
                              </div>
                            )}
                            {drill && drill.designers.length === 0 && (
                              <p className="py-3 text-sm text-muted-foreground">{t('productTimes.ordersEmpty')}</p>
                            )}
                            {drill && drill.designers.length > 0 && (
                              <div className="space-y-1.5">
                                {drill.designers.map((d) => {
                                  const dKey = `${r.type}::${d.userId}`;
                                  const dOpen = openDesigners.has(dKey);
                                  const dOrders = drill.rows.filter((o) => o.assigneeId === d.userId);
                                  return (
                                    <div key={d.userId}>
                                      {/* Header nhóm designer — click để mở/thu gọn danh sách đơn */}
                                      <button
                                        type="button"
                                        onClick={() => toggleDesigner(r.type, d.userId)}
                                        className={cn(
                                          'flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60',
                                          dOpen && 'bg-muted/60',
                                        )}
                                      >
                                        {dOpen ? (
                                          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                                        )}
                                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                                          <User size={13} className="shrink-0 text-violet-500" />
                                          {d.name || t('productTimes.noAssignee')}
                                        </span>
                                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 tabular-nums">
                                          {t('productTimes.orderCount', { count: d.taskCount })}
                                        </span>
                                        <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                                          {t('productTimes.doneCount', { count: d.doneCount })}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                                          <Zap size={12} className="text-amber-500" />
                                          {d.avgResponseMin > 0 ? formatDuration(d.avgResponseMin) : '—'}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                                          <Timer size={12} className="text-emerald-500" />
                                          {d.avgWorkMin > 0 ? formatDuration(d.avgWorkMin) : '—'}
                                        </span>
                                      </button>
                                      {/* Từng đơn của designer — thời gian nhận/làm riêng mỗi đơn */}
                                      {dOpen && (
                                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-violet-200 pl-3 dark:border-violet-500/30">
                                          {dOrders.map((o) => (
                                            <div
                                              key={o._id}
                                              className="flex items-center gap-3 rounded border border-border/60 bg-card px-2.5 py-1.5 text-sm"
                                            >
                                              {o.mockupUrl ? (
                                                <img
                                                  src={o.mockupUrl}
                                                  alt=""
                                                  loading="lazy"
                                                  className="h-9 w-9 shrink-0 cursor-zoom-in rounded object-cover"
                                                  onClick={() =>
                                                    setPreview({ url: o.mockupUrl!, title: o.productionId })
                                                  }
                                                />
                                              ) : (
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                                                  <ImageOff size={14} />
                                                </span>
                                              )}
                                              <span className="w-32 shrink-0 truncate font-mono text-xs font-semibold">
                                                {o.productionId || '—'}
                                              </span>
                                              <span
                                                className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-slate-600 dark:text-slate-300"
                                                title={t('productTimes.customerTip')}
                                              >
                                                <UserRound size={12} className="shrink-0 text-sky-500" />
                                                <span className="truncate">{o.userSku || '—'}</span>
                                              </span>
                                              <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                                                <CalendarDays size={12} className="text-sky-500" />
                                                {o.inProductionAt ? dayjs(o.inProductionAt).format('DD/MM') : '—'}
                                              </span>
                                              <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                                                <Zap size={12} className="text-amber-500" />
                                                {o.responseMin !== undefined ? formatDuration(o.responseMin) : '—'}
                                              </span>
                                              <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                                                <Timer size={12} className="text-emerald-500" />
                                                {o.workMin !== undefined ? formatDuration(o.workMin) : '—'}
                                              </span>
                                            </div>
                                          ))}
                                          {dOrders.length < d.taskCount && (
                                            <p className="py-0.5 text-xs italic text-muted-foreground">
                                              {t('productTimes.moreOrders', { count: d.taskCount - dOrders.length })}
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <ImagePreviewDialog
          open={!!preview}
          onOpenChange={(open) => !open && setPreview(null)}
          url={preview?.url}
          title={preview?.title}
        />
      </div>
    </TooltipProvider>
  );
}
