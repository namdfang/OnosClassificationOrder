import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Factory,
  Layers,
  ListChecks,
  MessageSquareWarning,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ProductionOrder, WorkshopConfig } from 'shared';
import {
  FULFILLMENT_STAGE_LABELS,
  FULFILLMENT_STAGE_ORDER,
  FULFILLMENT_STAGES,
  FulfillmentStage,
  FulfillmentTransitionAction,
  WorkshopConfigCategory,
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { cn } from '@/utils/cn';
import { handleAxiosError } from '@/utils';

const MAX_NOTE = 500;
const OTHER_CODE = 'other';

type ReworkTarget = 'none' | 'designer' | FulfillmentStage;

type ScannedOrder = ProductionOrder & {
  factory?: { name?: string; shortName?: string };
  machineType?: { name?: string; shortName?: string };
};

interface Props {
  order: ScannedOrder;
  onClose: () => void;
  /** Gọi sau khi gán lỗi (và rework-back nếu có) thành công. Page sẽ append vào lịch sử + re-focus input. */
  onSaved: (summary: { errorName: string; targetLabel: string }) => void;
}

export function OrderErrorScanDialog({ order, onClose, onSaved }: Props) {
  const errorOptions = useWorkshopConfigStore(
    (s) => s.byCategory[WorkshopConfigCategory.ProductionError] || [],
  ) as WorkshopConfig[];

  const sortedOptions = useMemo(
    () => [...errorOptions].sort((a, b) => a.order - b.order),
    [errorOptions],
  );

  const currentStage = order.currentFulfillmentStage as FulfillmentStage | undefined;
  const previousStages = useMemo(() => {
    if (!currentStage) return [] as FulfillmentStage[];
    const idx = FULFILLMENT_STAGE_ORDER[currentStage];
    return FULFILLMENT_STAGES.filter((s) => FULFILLMENT_STAGE_ORDER[s] < idx);
  }, [currentStage]);

  const [code, setCode] = useState<string>('');
  const [source, setSource] = useState<'designer' | 'factory' | undefined>(undefined);
  const [note, setNote] = useState<string>('');
  const [reworkTarget, setReworkTarget] = useState<ReworkTarget>('none');
  const [saving, setSaving] = useState(false);

  // Pre-fill từ workshop_config khi pick code (mirror BE auto-fill logic)
  useEffect(() => {
    if (!code) {
      setSource(undefined);
      return;
    }
    const cfg = sortedOptions.find((o) => o.code === code);
    if (cfg?.errorSource === 'designer' || cfg?.errorSource === 'factory') {
      setSource(cfg.errorSource);
    }
  }, [code, sortedOptions]);

  const isOther = code === OTHER_CODE;
  const noteRequired = isOther; // 'other' bắt buộc note (theo rule BE)
  const sourceRequired = isOther || !source; // 'other' bắt buộc, hoặc khi config không có errorSource

  const canSubmit =
    !!code &&
    !!source &&
    (!noteRequired || !!note.trim()) &&
    !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      // 1. Always: gán mã lỗi xưởng (kéo theo set toolResultNote='error',
      //    productionFirstErrorAt, productionErrorCount++).
      await RepositoryRemote.order.setProductionError(order._id, {
        code,
        source,
        note: note.trim() || undefined,
      });

      // 2. Optional: rework-back về stage trước hoặc designer. Chỉ áp được khi
      //    đơn đang ở fulfillment workflow (currentFulfillmentStage != null).
      let targetLabel = 'Chỉ mark lỗi';
      if (currentStage && reworkTarget !== 'none') {
        await RepositoryRemote.fulfillment.transition(order._id, {
          stage: currentStage,
          action: FulfillmentTransitionAction.ReworkBack,
          target: reworkTarget,
          reason: note.trim() || 'Gán lỗi qua màn hình quét',
        });
        targetLabel =
          reworkTarget === 'designer'
            ? 'Đẩy về Designer'
            : `Đẩy về ${FULFILLMENT_STAGE_LABELS[reworkTarget as FulfillmentStage]}`;
      }

      const errorName =
        sortedOptions.find((o) => o.code === code)?.name || code;
      toast.success(`Đã gán lỗi "${errorName}" · ${targetLabel}`);
      onSaved({ errorName, targetLabel });
      onClose();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const factoryLabel =
    order.factory?.shortName || order.factory?.name || (order.factoryId ? '—' : 'Chưa map');
  const machineLabel = order.machineType?.shortName || order.machineType?.name || '';
  const stageLabel = currentStage ? FULFILLMENT_STAGE_LABELS[currentStage] : 'Chưa vào fulfillment';

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-xl" onKeyDown={(e) => {
        // Cho phép Cmd/Ctrl+Enter submit nhanh khi đã đủ điều kiện
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
          e.preventDefault();
          handleSubmit();
        }
      }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareWarning size={18} className="text-rose-500" />
            Gán lỗi · {order.productionId}
          </DialogTitle>
        </DialogHeader>

        {/* Order summary card */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            {order.mockupUrl ? (
              <img
                src={order.mockupUrl}
                alt={order.productionId}
                className="w-12 h-12 rounded object-cover border bg-checker shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded border bg-muted shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{order.type || 'Không rõ loại'}</div>
              <div className="text-muted-foreground truncate">
                {[order.color, order.size, order.quantity ? `qty ${order.quantity}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <InfoRow icon={<Factory size={12} />} label="Xưởng">
              {factoryLabel}
              {machineLabel && (
                <span className="text-muted-foreground"> · {machineLabel}</span>
              )}
            </InfoRow>
            <InfoRow icon={<Layers size={12} />} label="Stage hiện tại">
              {stageLabel}
              {order.designerReworkCount && order.designerReworkCount > 0 ? (
                <span className="ml-1 text-amber-600 dark:text-amber-400">
                  · rework ×{order.designerReworkCount}
                </span>
              ) : null}
            </InfoRow>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Mã lỗi */}
          <div className="space-y-2">
            <Label className="text-xs">
              Mã lỗi <span className="text-destructive">*</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {sortedOptions.map((opt) => {
                const active = code === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setCode(opt.code)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs transition-colors',
                      active
                        ? 'bg-rose-500 border-rose-500 text-white'
                        : 'bg-background border-border hover:border-rose-300',
                    )}
                  >
                    {opt.name}
                    {opt.code === OTHER_CODE && (
                      <AlertTriangle size={11} className={active ? 'text-white' : 'text-rose-500'} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nguồn lỗi */}
          <div className="space-y-2">
            <Label className="text-xs">
              Nguồn lỗi <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <SourceButton
                active={source === 'factory'}
                color="sky"
                onClick={() => setSource('factory')}
                label="Do xưởng"
              />
              <SourceButton
                active={source === 'designer'}
                color="violet"
                onClick={() => setSource('designer')}
                label="Do designer"
              />
            </div>
            {source === 'designer' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Lỗi designer → task tự về "Cần làm lại" cho designer đã làm đơn này.
              </p>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label className="text-xs">
              Mô tả lỗi {noteRequired && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
              placeholder={
                noteRequired
                  ? 'Bắt buộc khi chọn "Lỗi khác" — mô tả cụ thể'
                  : 'Mô tả ngắn gọn lỗi gặp phải (tùy chọn)'
              }
            />
            <div className="text-right text-[10px] text-muted-foreground">
              {note.length}/{MAX_NOTE}
            </div>
          </div>

          {/* Rework target — chỉ hiện khi đã vào fulfillment */}
          {currentStage && (
            <div className="space-y-2 pt-1 border-t">
              <Label className="text-xs flex items-center gap-1.5">
                <RotateCcw size={12} />
                Đẩy về công đoạn <span className="text-muted-foreground font-normal">(tùy chọn)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                <ChipButton
                  active={reworkTarget === 'none'}
                  onClick={() => setReworkTarget('none')}
                  label="Chỉ mark lỗi"
                />
                <ChipButton
                  active={reworkTarget === 'designer'}
                  onClick={() => setReworkTarget('designer')}
                  label="Designer"
                />
                {previousStages.map((s) => (
                  <ChipButton
                    key={s}
                    active={reworkTarget === s}
                    onClick={() => setReworkTarget(s)}
                    label={FULFILLMENT_STAGE_LABELS[s]}
                  />
                ))}
              </div>
              {reworkTarget !== 'none' && (
                <p className="text-[11px] text-muted-foreground">
                  Mô tả lỗi sẽ được dùng làm lý do rework. Nếu trống, mặc định "Gán lỗi qua màn hình quét".
                </p>
              )}
            </div>
          )}
          {!currentStage && (
            <div className="rounded-md border border-dashed border-amber-300/50 bg-amber-50/40 dark:bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <ListChecks size={12} className="mt-0.5 shrink-0" />
              <span>
                Đơn chưa vào fulfillment — chỉ có thể mark lỗi, không thể đẩy về công đoạn.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving && <Spinner size={14} className="mr-2" />}
            Gán lỗi & Quét tiếp
          </Button>
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

function SourceButton({
  active,
  color,
  onClick,
  label,
}: {
  active: boolean;
  color: 'sky' | 'violet';
  onClick: () => void;
  label: string;
}) {
  const activeCls =
    color === 'sky'
      ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
      : 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300';
  const hoverCls = color === 'sky' ? 'hover:border-sky-300' : 'hover:border-violet-300';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors',
        active ? activeCls : `border-border bg-background text-muted-foreground ${hoverCls}`,
      )}
    >
      <Building2 size={12} className="inline -mt-0.5 mr-1" />
      {label}
    </button>
  );
}

function ChipButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-foreground border-border hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}
