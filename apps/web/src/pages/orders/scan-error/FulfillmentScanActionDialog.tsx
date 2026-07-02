import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Factory,
  ImageIcon,
  Layers,
  MessageSquareWarning,
  Package,
  Palette,
  PlayCircle,
  RotateCw,
  Ruler,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ProductionOrder } from 'shared';
import {
  FULFILLMENT_STAGE_LABELS,
  FulfillmentStage,
  FulfillmentStageStatus,
  FulfillmentTransitionAction,
} from 'shared';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RepositoryRemote } from '@/services';
import { cn } from '@/utils/cn';
import { handleAxiosError } from '@/utils';

type ScannedOrder = ProductionOrder & {
  factory?: { name?: string; shortName?: string };
  machineType?: { name?: string; shortName?: string };
};

interface Props {
  order: ScannedOrder;
  /** Stage user Fulfillment đang phụ trách. */
  myStage: FulfillmentStage;
  /** factoryId của user — đơn phải cùng xưởng mới thao tác được (khớp BE guard). */
  myFactoryId?: string;
  onClose: () => void;
  /** Sau khi hoàn thành công đoạn → page append lịch sử + re-focus input. */
  onCompleted: (summary: { stageLabel: string }) => void;
  /** User bấm "Báo lỗi" → page chuyển sang dialog gán lỗi. */
  onReportError: () => void;
}

const STATUS_META: Record<
  string,
  { label: string; icon: React.ElementType; cls: string }
> = {
  [FulfillmentStageStatus.Waiting]: {
    label: 'Đang chờ',
    icon: Clock,
    cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300',
  },
  [FulfillmentStageStatus.InProgress]: {
    label: 'Đang làm',
    icon: PlayCircle,
    cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  },
  [FulfillmentStageStatus.Rework]: {
    label: 'Làm lại',
    icon: RotateCw,
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  [FulfillmentStageStatus.Done]: {
    label: 'Đã xong',
    icon: CheckCircle2,
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
};

// Nhãn tiếng Việt cho từng vị trí design → hiển thị link mở file thiết kế.
const DESIGN_LABELS: Record<string, string> = {
  front: 'Mặt trước',
  back: 'Mặt sau',
  sleeve: 'Tay áo',
  hood: 'Mũ',
  folder: 'Folder',
  placket: 'Nẹp',
  chestLeft: 'Ngực trái',
  chestRight: 'Ngực phải',
  left: 'Trái',
  right: 'Phải',
  sleeveLeft: 'Tay trái',
  sleeveRight: 'Tay phải',
  leftUpperSleeve: 'Tay trên trái',
  rightUpperSleeve: 'Tay trên phải',
  leftCuff: 'Cổ tay trái',
  rightCuff: 'Cổ tay phải',
  frontEmbroidery: 'Thêu trước',
  backEmbroidery: 'Thêu sau',
};

/**
 * Dialog cho công nhân Fulfillment khi quét 1 đơn:
 *  - Nếu đơn đang ở ĐÚNG công đoạn của user (cùng stage + cùng xưởng) → cho
 *    "Hoàn thành" (Enter). Đơn đang chờ/làm lại sẽ tự `start` rồi `complete`
 *    trong 1 lần (mô tả ở UI). Kèm nút "Báo lỗi".
 *  - Nếu KHÔNG phải task của user → chỉ hiển thị chi tiết + banner cảnh báo,
 *    chặn mọi thao tác; Enter = đóng để quét tiếp.
 *
 * Layout to/rộng: mockup lớn bên trái, thông tin (sản phẩm/size/màu/xưởng/công
 * đoạn/tool/link design) chữ lớn bên phải.
 */
export function FulfillmentScanActionDialog({
  order,
  myStage,
  myFactoryId,
  onClose,
  onCompleted,
  onReportError,
}: Props) {
  const currentStage = order.currentFulfillmentStage as FulfillmentStage | undefined;
  const stageStatus = (order.fulfillmentStages?.[myStage]?.status ?? undefined) as
    | FulfillmentStageStatus
    | undefined;

  const sameFactory = String(order.factoryId ?? '') === String(myFactoryId ?? '');
  const sameStage = currentStage === myStage;
  // Task của user = đơn đang ở stage này + cùng xưởng + status thao tác được.
  const workable =
    stageStatus === FulfillmentStageStatus.Waiting ||
    stageStatus === FulfillmentStageStatus.InProgress ||
    stageStatus === FulfillmentStageStatus.Rework;
  const isMyTask = sameStage && sameFactory && workable;

  // Lý do khi không phải task — để hiển thị banner rõ ràng.
  const blockReason = useMemo(() => {
    if (isMyTask) return null;
    if (!sameFactory) return 'Đơn thuộc xưởng khác — bạn không thao tác được.';
    if (stageStatus === FulfillmentStageStatus.Done)
      return 'Bạn đã hoàn thành công đoạn này cho đơn rồi.';
    if (!currentStage) return 'Đơn chưa vào quy trình fulfillment.';
    if (!sameStage)
      return `Đơn đang ở công đoạn "${FULFILLMENT_STAGE_LABELS[currentStage]}", không phải công đoạn của bạn.`;
    return 'Đơn không ở trạng thái thao tác được.';
  }, [isMyTask, currentStage, sameStage, sameFactory, stageStatus]);

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const myStageLabel = FULFILLMENT_STAGE_LABELS[myStage];

  const doComplete = async () => {
    if (!isMyTask || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Đang chờ/làm lại → start trước, rồi complete (1 lần quét = xong).
      if (
        stageStatus === FulfillmentStageStatus.Waiting ||
        stageStatus === FulfillmentStageStatus.Rework
      ) {
        await RepositoryRemote.fulfillment.transition(order._id, {
          stage: myStage,
          action: FulfillmentTransitionAction.Start,
        });
      }
      await RepositoryRemote.fulfillment.transition(order._id, {
        stage: myStage,
        action: FulfillmentTransitionAction.Complete,
      });
      toast.success(`Đã hoàn thành "${myStageLabel}" · ${order.productionId}`);
      onCompleted({ stageLabel: myStageLabel });
      onClose();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (saving) return;
    if (isMyTask) void doComplete();
    else onClose(); // không phải task → Enter để quét tiếp
  };

  const statusMeta = stageStatus ? STATUS_META[stageStatus] : undefined;
  const factoryLabel =
    order.factory?.shortName || order.factory?.name || (order.factoryId ? '—' : 'Chưa map');
  const machineLabel = order.machineType?.shortName || order.machineType?.name || '';

  const mockupUrl = order.mockupOriginalUrl || order.mockupUrl;

  // Trạng thái soát tool: 'ok' = đã ok, có note khác = lỗi, rỗng = chưa soát.
  const toolNote = (order.toolResultNote ?? '').trim();
  const toolMeta = useMemo(() => {
    if (!toolNote) return { label: 'Chưa soát', cls: 'text-muted-foreground', ok: false };
    if (toolNote.toLowerCase() === 'ok')
      return { label: 'OK', cls: 'text-emerald-600 dark:text-emerald-400', ok: true };
    return { label: toolNote, cls: 'text-rose-600 dark:text-rose-400', ok: false };
  }, [toolNote]);

  // Gom link design (các vị trí có URL) + file cutting.
  const designLinks = useMemo(() => {
    const d = (order.designs ?? {}) as Record<string, string | undefined>;
    const links = Object.entries(d)
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([k, v]) => ({ key: k, label: DESIGN_LABELS[k] ?? k, url: v as string }));
    if (order.cuttingFileUrl) {
      links.push({
        key: 'cutting',
        label: order.cuttingFileName || 'File cutting',
        url: order.cuttingFileUrl,
      });
    }
    return links;
  }, [order.designs, order.cuttingFileUrl, order.cuttingFileName]);

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[98vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Layers size={20} className="text-primary" />
            Công đoạn của tôi · {myStageLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          {/* Mockup lớn — click mở ảnh gốc tab mới */}
          <div className="min-w-0">
            {mockupUrl ? (
              <a
                href={mockupUrl}
                target="_blank"
                rel="noreferrer"
                title="Click để mở ảnh gốc"
                className="group relative block w-full aspect-square rounded-xl border border-border overflow-hidden bg-checker"
              >
                <img
                  src={order.mockupUrl || mockupUrl}
                  alt={order.productionId}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink size={12} /> Mở ảnh gốc
                </span>
              </a>
            ) : (
              <div className="w-full aspect-square rounded-xl border border-dashed border-border bg-muted/40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageIcon size={40} />
                <span className="text-xs">Không có mockup</span>
              </div>
            )}
          </div>

          {/* Thông tin — chữ lớn */}
          <div className="min-w-0 space-y-4">
            {/* Tên sản phẩm + productionId + trạng thái */}
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-xl font-bold leading-tight text-foreground">
                  {order.type || 'Không rõ loại sản phẩm'}
                </h2>
                {statusMeta && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold shrink-0',
                      statusMeta.cls,
                    )}
                  >
                    <statusMeta.icon size={13} />
                    {statusMeta.label}
                  </span>
                )}
              </div>
              <div className="font-mono text-base font-semibold text-primary">
                {order.productionId}
              </div>
              {order.userSku && (
                <div className="text-sm text-muted-foreground truncate">📧 {order.userSku}</div>
              )}
            </div>

            {/* Size / Màu / SL — badge lớn */}
            <div className="grid grid-cols-3 gap-2">
              <BigField icon={<Ruler size={15} />} label="Size" value={order.size || '—'} />
              <BigField icon={<Palette size={15} />} label="Màu" value={order.color || '—'} />
              <BigField
                icon={<Package size={15} />}
                label="Số lượng"
                value={String(order.quantity ?? 1)}
              />
            </div>

            {/* Xưởng / Công đoạn / Tool */}
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <DetailRow icon={<Factory size={15} />} label="Xưởng">
                <span className="font-medium">{factoryLabel}</span>
                {machineLabel && (
                  <span className="text-muted-foreground"> · {machineLabel}</span>
                )}
              </DetailRow>
              <DetailRow icon={<Layers size={15} />} label="Công đoạn hiện tại">
                <span className="font-medium">
                  {currentStage
                    ? FULFILLMENT_STAGE_LABELS[currentStage]
                    : 'Chưa vào fulfillment'}
                </span>
              </DetailRow>
              <DetailRow icon={<Wrench size={15} />} label="Kết quả soát tool">
                <span className={cn('font-semibold', toolMeta.cls)}>{toolMeta.label}</span>
              </DetailRow>
            </div>

            {/* Link design */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Link design ({designLinks.length})
              </div>
              {designLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Chưa có link design.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {designLinks.map((l) => (
                    <a
                      key={l.key}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
                    >
                      <ExternalLink size={12} />
                      {l.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Banner trạng thái thao tác */}
        {isMyTask ? (
          <div className="rounded-md border border-emerald-300/50 bg-emerald-50/50 dark:bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-1.5">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span>
              {stageStatus === FulfillmentStageStatus.InProgress ? (
                <>Đơn đang ở trạng thái <strong>Đang làm</strong> — nhấn Enter để Hoàn thành.</>
              ) : (
                <>
                  Đơn đang ở trạng thái{' '}
                  <strong>{statusMeta?.label ?? '—'}</strong> — nhấn Enter sẽ tự Bắt đầu rồi Hoàn
                  thành luôn.
                </>
              )}
            </span>
          </div>
        ) : (
          <div className="rounded-md border border-rose-300/50 bg-rose-50/50 dark:bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>Không phải task của bạn.</strong> {blockReason} Nhấn Enter để quét đơn tiếp
              theo.
            </span>
          </div>
        )}

        <DialogFooter className="gap-2">
          {isMyTask ? (
            <>
              <Button variant="outline" onClick={onReportError} disabled={saving}>
                <MessageSquareWarning size={15} className="mr-1.5 text-rose-500" />
                Báo lỗi
              </Button>
              <Button onClick={() => void doComplete()} disabled={saving} autoFocus size="lg">
                {saving ? (
                  <Spinner size={15} className="mr-2" />
                ) : (
                  <CheckCircle2 size={16} className="mr-1.5" />
                )}
                Hoàn thành (Enter)
              </Button>
            </>
          ) : (
            <Button onClick={onClose} autoFocus size="lg">
              Đóng & quét tiếp (Enter)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ô số liệu lớn (size / màu / số lượng). */
function BigField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold text-foreground truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}
