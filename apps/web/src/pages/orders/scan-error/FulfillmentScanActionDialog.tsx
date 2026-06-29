import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Factory,
  Layers,
  MessageSquareWarning,
  PlayCircle,
  RotateCw,
  ShieldAlert,
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

/**
 * Dialog cho công nhân Fulfillment khi quét 1 đơn:
 *  - Nếu đơn đang ở ĐÚNG công đoạn của user (cùng stage + cùng xưởng) → cho
 *    "Hoàn thành" (Enter). Đơn đang chờ/làm lại sẽ tự `start` rồi `complete`
 *    trong 1 lần (mô tả ở UI). Kèm nút "Báo lỗi".
 *  - Nếu KHÔNG phải task của user → chỉ hiển thị chi tiết + banner cảnh báo,
 *    chặn mọi thao tác; Enter = đóng để quét tiếp.
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

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-xl" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers size={18} className="text-primary" />
            Công đoạn của tôi · {myStageLabel}
          </DialogTitle>
        </DialogHeader>

        {/* Order summary */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            {order.mockupUrl ? (
              <img
                src={order.mockupUrl}
                alt={order.productionId}
                className="w-14 h-14 rounded object-cover border bg-checker shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded border bg-muted shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-mono font-semibold text-sm truncate">{order.productionId}</div>
              <div className="font-medium truncate">{order.type || 'Không rõ loại'}</div>
              <div className="text-muted-foreground truncate">
                {[order.color, order.size, order.quantity ? `qty ${order.quantity}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            {statusMeta && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium shrink-0',
                  statusMeta.cls,
                )}
              >
                <statusMeta.icon size={12} />
                {statusMeta.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <InfoRow icon={<Factory size={12} />} label="Xưởng">
              {factoryLabel}
              {machineLabel && <span className="text-muted-foreground"> · {machineLabel}</span>}
            </InfoRow>
            <InfoRow icon={<Layers size={12} />} label="Công đoạn hiện tại">
              {currentStage ? FULFILLMENT_STAGE_LABELS[currentStage] : 'Chưa vào fulfillment'}
            </InfoRow>
          </div>
        </div>

        {/* Banner trạng thái thao tác */}
        {isMyTask ? (
          <div className="rounded-md border border-emerald-300/50 bg-emerald-50/50 dark:bg-emerald-500/5 p-2.5 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-start gap-1.5">
            <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
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
          <div className="rounded-md border border-rose-300/50 bg-rose-50/50 dark:bg-rose-500/5 p-2.5 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
            <ShieldAlert size={13} className="mt-0.5 shrink-0" />
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
                <MessageSquareWarning size={14} className="mr-1.5 text-rose-500" />
                Báo lỗi
              </Button>
              <Button onClick={() => void doComplete()} disabled={saving} autoFocus>
                {saving ? (
                  <Spinner size={14} className="mr-2" />
                ) : (
                  <CheckCircle2 size={15} className="mr-1.5" />
                )}
                Hoàn thành (Enter)
              </Button>
            </>
          ) : (
            <Button onClick={onClose} autoFocus>
              Đóng & quét tiếp (Enter)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium truncate">{children}</span>
    </div>
  );
}
