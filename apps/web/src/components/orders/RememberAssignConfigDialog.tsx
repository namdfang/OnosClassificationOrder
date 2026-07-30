import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { AlertTriangle, BookmarkPlus } from 'lucide-react';
import type { DesignerAssignmentConfig, DesignerTeamMember } from 'shared';
import { Status } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

export interface RememberProductItem {
  /** productConfigId (group key ở bảng "Cần gán designer"). */
  id: string;
  name: string;
  /** Số đơn đang được chọn thuộc sản phẩm này. */
  selectedCount: number;
}

type Duration = 'now' | 'day' | 'week' | 'forever';
const DURATIONS: Duration[] = ['now', 'day', 'week', 'forever'];

interface Props {
  open: boolean;
  /** Sản phẩm sẽ ghi nhớ (đã loại nhóm "Chưa map sản phẩm"). */
  products: RememberProductItem[];
  /** TOÀN BỘ đơn đang được chọn — gán ngay cho designer, kể cả đơn chưa map sản phẩm. */
  selectedOrderIds: string[];
  /** Số đơn được chọn KHÔNG thể ghi nhớ (nhóm chưa map sản phẩm) — chỉ gán ngay. */
  unmappedSelectedCount: number;
  onClose: () => void;
  onApplied: () => void;
}

/**
 * "Ghi nhớ cấu hình" (Admin/SuperAdmin) từ bảng "Cần gán designer": gán ngay các
 * đơn đã chọn cho designer + (tùy thời hạn) lưu mapping sản phẩm→designer vào
 * config auto-gán Ưu tiên 2 (`POST /designer-assignment/remember-products`).
 * 1 ngày = đến hết hôm nay; 7 ngày = đến hết ngày thứ 7; vĩnh viễn = không hạn;
 * "Hiện tại" = chỉ gán, không lưu.
 */
export function RememberAssignConfigDialog({
  open,
  products,
  selectedOrderIds,
  unmappedSelectedCount,
  onClose,
  onApplied,
}: Props) {
  const { t } = useTranslation('dashboard');
  const [designers, setDesigners] = useState<DesignerTeamMember[]>([]);
  const [config, setConfig] = useState<DesignerAssignmentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [designerId, setDesignerId] = useState('');
  const [duration, setDuration] = useState<Duration>('forever');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDesignerId('');
    setDuration('forever');
    (async () => {
      try {
        setLoading(true);
        const [teamRes, cfgRes] = await Promise.all([
          RepositoryRemote.designer.listTeam(Status.Active),
          RepositoryRemote.designerAssignment.getConfig(),
        ]);
        setDesigners((teamRes.data?.data || []) as DesignerTeamMember[]);
        setConfig((cfgRes.data?.data || null) as DesignerAssignmentConfig | null);
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const designerById = useMemo(() => new Map(designers.map((d) => [String(d._id), d])), [designers]);

  // Sản phẩm đang thuộc designer KHÁC trong config Ưu tiên 2 → cảnh báo ghi đè.
  const conflicts = useMemo(() => {
    if (!config) return [];
    const ownerByPid = new Map<string, string>();
    for (const p of config.products || []) {
      for (const pid of p.productConfigIds || []) ownerByPid.set(String(pid), String(p.designerId));
    }
    return products
      .map((p) => ({ product: p, ownerId: ownerByPid.get(p.id) }))
      .filter((c): c is { product: RememberProductItem; ownerId: string } => !!c.ownerId && c.ownerId !== designerId);
  }, [config, products, designerId]);

  const buildExpiresAt = (): string | undefined => {
    if (duration === 'day') return dayjs().endOf('day').toISOString();
    if (duration === 'week') return dayjs().add(6, 'day').endOf('day').toISOString();
    return undefined; // forever
  };

  const handleSubmit = async () => {
    if (!designerId) {
      toast.error(t('assignBacklog.remember.chooseDesignerFirst'));
      return;
    }
    try {
      setSubmitting(true);
      if (duration !== 'now' && products.length > 0) {
        const expiresAt = buildExpiresAt();
        await RepositoryRemote.designerAssignment.rememberProducts({
          designerId,
          productConfigIds: products.map((p) => p.id),
          ...(expiresAt ? { expiresAt } : {}),
        });
        toast.success(t('assignBacklog.remember.savedConfig', { count: products.length }));
      }
      const res = await RepositoryRemote.order.bulkAssignDesigner({
        ids: selectedOrderIds,
        userId: designerId,
        reassignOthers: false,
        skipUnreviewed: false,
      });
      const data = res.data?.data as {
        matched: number;
        modified: number;
        skipped: { orderId: string; productionId: string; reason: string }[];
      };
      if (data.skipped.length === 0) {
        toast.success(t('assignBacklog.remember.assigned', { modified: data.modified, matched: data.matched }));
      } else {
        toast.warning(
          t('assignBacklog.remember.assignedWithSkipped', { modified: data.modified, count: data.skipped.length }),
          { duration: 7000 },
        );
      }
      onApplied();
      onClose();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus size={16} className="text-indigo-600" />
            {t('assignBacklog.remember.title')}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size={20} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Sản phẩm sẽ ghi nhớ + số đơn gán ngay */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">
                {t('assignBacklog.remember.productsLabel', { count: products.length })}
              </p>
              <div className="max-h-36 overflow-y-auto divide-y divide-border/50 rounded-md border border-border">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate">{p.name}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {t('assignBacklog.orderCount', { count: p.selectedCount })}
                    </Badge>
                  </div>
                ))}
                {products.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {t('assignBacklog.remember.noRememberableProducts')}
                  </p>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {t('assignBacklog.remember.assignNowNote', { count: selectedOrderIds.length })}
              </p>
              {unmappedSelectedCount > 0 && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  {t('assignBacklog.remember.unmappedNote', { count: unmappedSelectedCount })}
                </p>
              )}
            </div>

            {/* Thời hạn ghi nhớ */}
            <div className="space-y-1.5">
              <Label>{t('assignBacklog.remember.durationLabel')}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-xs transition-colors',
                      duration === d
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-medium'
                        : 'border-border text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    {t(`assignBacklog.remember.durations.${d}`)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t(`assignBacklog.remember.durationHints.${duration}`)}
              </p>
            </div>

            {/* Designer */}
            <div className="space-y-1.5">
              <Label>{t('assignBacklog.remember.designerLabel')}</Label>
              {designers.length === 0 ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">{t('assignBacklog.remember.noDesigners')}</p>
              ) : (
                <select
                  value={designerId}
                  onChange={(e) => setDesignerId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{t('assignBacklog.remember.designerPlaceholder')}</option>
                  {designers.map((d) => (
                    <option key={d._id} value={d._id}>
                      {t('assignBacklog.remember.designerOption', { fullName: d.fullName, count: d.activeTaskCount })}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Cảnh báo ghi đè sản phẩm đã thuộc designer khác */}
            {duration !== 'now' && conflicts.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-[11px] text-amber-800 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-medium">{t('assignBacklog.remember.conflictTitle', { count: conflicts.length })}</p>
                    {conflicts.slice(0, 5).map((c) => (
                      <p key={c.product.id} className="truncate">
                        •{' '}
                        {t('assignBacklog.remember.conflictLine', {
                          product: c.product.name,
                          designer: designerById.get(c.ownerId)?.fullName || `#${c.ownerId.slice(-4)}`,
                        })}
                      </p>
                    ))}
                    {conflicts.length > 5 && (
                      <p>{t('assignBacklog.remember.conflictMore', { count: conflicts.length - 5 })}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('assignBacklog.remember.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading || !designerId}>
            {submitting && <Spinner size={13} className="mr-1.5" />}
            {duration === 'now'
              ? t('assignBacklog.remember.confirmAssignOnly', { count: selectedOrderIds.length })
              : t('assignBacklog.remember.confirm', { orders: selectedOrderIds.length, products: products.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
