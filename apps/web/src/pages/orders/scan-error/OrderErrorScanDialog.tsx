import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Factory, Layers, ListChecks, MessageSquareWarning, RotateCcw } from 'lucide-react';
import type { ProductionOrder, WorkshopConfig } from 'shared';
import {
  FULFILLMENT_STAGE_LABELS,
  FULFILLMENT_STAGE_ORDER,
  FULFILLMENT_STAGES,
  FulfillmentStage,
  WorkshopConfigCategory,
} from 'shared';
import { toast } from 'sonner';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';
import { isCancelled } from '@/utils/orderActions';

const MAX_NOTE = 500;
const OTHER_CODE = 'other';

type ReworkTarget = 'none' | 'designer' | 'tool-check' | FulfillmentStage;
type ErrorSource = 'designer' | 'factory' | 'tool-check';

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

  const sortedOptions = useMemo(() => [...errorOptions].sort((a, b) => a.order - b.order), [errorOptions]);

  const currentStage = order.currentFulfillmentStage as FulfillmentStage | undefined;
  const isCompleted = !currentStage && !!order.fulfillmentCompletedAt;
  // Vị trí xa nhất đơn từng tới → cho phép đẩy về mọi stage TRƯỚC vị trí đó. Đơn
  // đã hoàn thành fulfillment (currentStage=null nhưng có fulfillmentCompletedAt)
  // → furthest=Pack → đẩy về In..May xuất (reopen + làm lại toàn chuỗi).
  const furthest = currentStage ?? (isCompleted ? FulfillmentStage.Pack : undefined);
  // Đơn đã vào fulfillment HOẶC đã hoàn thành → cho phép rework-back designer/stage.
  const canReworkBack = !!currentStage || isCompleted;
  const previousStages = useMemo(() => {
    if (!furthest) return [] as FulfillmentStage[];
    const idx = FULFILLMENT_STAGE_ORDER[furthest];
    return FULFILLMENT_STAGES.filter((s) => FULFILLMENT_STAGE_ORDER[s] < idx);
  }, [furthest]);

  const [code, setCode] = useState<string>('');
  // Mặc định nguồn lỗi + đẩy về = "Soát tool" (theo ToolCheckWorkflow).
  const [source, setSource] = useState<ErrorSource | undefined>('tool-check');
  const [note, setNote] = useState<string>('');
  const [reworkTarget, setReworkTarget] = useState<ReworkTarget>('tool-check');
  const [saving, setSaving] = useState(false);

  // Pre-fill từ workshop_config khi pick code (mirror BE auto-fill logic).
  // Không reset khi bỏ chọn code → giữ nguồn mặc định "tool-check".
  useEffect(() => {
    if (!code) return;
    const cfg = sortedOptions.find((o) => o.code === code);
    if (cfg?.errorSource === 'designer' || cfg?.errorSource === 'factory' || cfg?.errorSource === 'tool-check') {
      setSource(cfg.errorSource);
    }
  }, [code, sortedOptions]);

  const isOther = code === OTHER_CODE;
  const noteRequired = isOther; // 'other' bắt buộc note (theo rule BE)
  const sourceRequired = isOther || !source; // 'other' bắt buộc, hoặc khi config không có errorSource
  // Đơn đã hủy → chặn báo lỗi / đẩy về công đoạn trước (mirror guard BE).
  const orderCancelled = isCancelled(order);

  const canSubmit = !!code && !!source && (!noteRequired || !!note.trim()) && !orderCancelled && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      // Gộp TẤT CẢ vào 1 lần setProductionError (BE atomic). Nhờ đi qua
      // setProductionError (không phải fulfillment-transition) nên báo được lỗi cả
      // đơn ĐÃ đi qua công đoạn mình / đã hoàn thành — không dính stage guard.
      //  - tool-check / designer: nguồn lỗi drive rework-back (source-based).
      //  - FulfillmentStage: BE đẩy về stage + làm lại toàn chuỗi (target-based).
      let effectiveSource: ErrorSource | undefined = source;
      let apiTarget: 'designer' | 'tool-check' | FulfillmentStage | undefined;
      let targetLabel = 'Chỉ mark lỗi';
      if (reworkTarget === 'tool-check') {
        effectiveSource = 'tool-check';
        apiTarget = 'tool-check';
        targetLabel = 'Đẩy về Soát tool';
      } else if (reworkTarget === 'designer') {
        effectiveSource = 'designer';
        apiTarget = 'designer';
        targetLabel = 'Đẩy về Designer';
      } else if (reworkTarget !== 'none') {
        // Đẩy về 1 công đoạn fulfillment trước → nguồn lỗi = xưởng.
        effectiveSource = 'factory';
        apiTarget = reworkTarget;
        targetLabel = `Đẩy về ${FULFILLMENT_STAGE_LABELS[reworkTarget as FulfillmentStage]}`;
      }

      await RepositoryRemote.order.setProductionError(order._id, {
        code,
        source: effectiveSource,
        note: note.trim() || undefined,
        target: apiTarget,
      });

      const errorName = sortedOptions.find((o) => o.code === code)?.name || code;
      toast.success(`Đã gán lỗi "${errorName}" · ${targetLabel}`);
      onSaved({ errorName, targetLabel });
      onClose();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const factoryLabel = order.factory?.shortName || order.factory?.name || (order.factoryId ? '—' : 'Chưa map');
  const machineLabel = order.machineType?.shortName || order.machineType?.name || '';
  const stageLabel = currentStage ? FULFILLMENT_STAGE_LABELS[currentStage] : 'Chưa vào fulfillment';

  // Lỗi đã ghi sẵn trên đơn (từ lần quét/gán trước) — hiển thị nổi bật để người
  // quét biết đơn này đang lỗi gì mà xử lý.
  const existingErrorName = order.productionError
    ? sortedOptions.find((o) => o.code === order.productionError)?.name || order.productionError
    : '';

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent
        className="max-w-xl"
        onKeyDown={(e) => {
          // Cho phép Cmd/Ctrl+Enter submit nhanh khi đã đủ điều kiện
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      >
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
                {[order.color, order.size, order.quantity ? `qty ${order.quantity}` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <InfoRow icon={<Factory size={12} />} label="Xưởng">
              {factoryLabel}
              {machineLabel && <span className="text-muted-foreground"> · {machineLabel}</span>}
            </InfoRow>
            <InfoRow icon={<Layers size={12} />} label="Stage hiện tại">
              {stageLabel}
              {order.designerReworkCount && order.designerReworkCount > 0 ? (
                <span className="ml-1 text-amber-600 dark:text-amber-400">· rework ×{order.designerReworkCount}</span>
              ) : null}
            </InfoRow>
          </div>
        </div>

        {/* Đơn đã hủy → chặn mọi thao tác báo lỗi / đẩy về công đoạn trước. */}
        {orderCancelled && (
          <div className="rounded-md border border-rose-400 bg-rose-100 p-2.5 flex items-start gap-2 dark:border-rose-500/50 dark:bg-rose-500/15">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="min-w-0 flex-1 text-xs text-rose-800 dark:text-rose-200">
              <p className="font-semibold">Đơn đã hủy — không thể báo lỗi</p>
              <p className="mt-0.5">Đơn hủy đã ra khỏi mọi công đoạn, không đẩy về công đoạn trước được.</p>
            </div>
          </div>
        )}

        {/* Lỗi + mô tả đã ghi trên đơn — nổi bật (đỏ) để người quét thấy ngay.
            Mô tả dài → cắt 2 dòng + tooltip (title) xem đầy đủ. */}
        {(order.productionErrorNote || existingErrorName) && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-2.5 flex items-start gap-2 dark:border-rose-500/40 dark:bg-rose-500/10">
            <MessageSquareWarning size={15} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5 flex-wrap">
                Lỗi đã ghi trên đơn
                {existingErrorName && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-200/70 font-normal dark:bg-rose-500/20">
                    {existingErrorName}
                  </span>
                )}
                {order.productionErrorSource && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-200/70 font-normal dark:bg-rose-500/20">
                    {order.productionErrorSource === 'designer'
                      ? 'Do designer'
                      : order.productionErrorSource === 'tool-check'
                        ? 'Do soát tool'
                        : 'Do xưởng'}
                  </span>
                )}
                {order.productionErrorCount && order.productionErrorCount > 1 ? (
                  <span className="px-1.5 py-0.5 rounded bg-rose-200/70 font-mono dark:bg-rose-500/20">
                    ×{order.productionErrorCount}
                  </span>
                ) : null}
              </p>
              {order.productionErrorNote && (
                <p
                  className="mt-0.5 text-xs text-rose-900 dark:text-rose-100 line-clamp-2 break-words cursor-help"
                  title={order.productionErrorNote}
                >
                  {order.productionErrorNote}
                </p>
              )}
            </div>
          </div>
        )}

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
                active={source === 'tool-check'}
                color="amber"
                onClick={() => setSource('tool-check')}
                label="Do soát tool"
              />
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
            {source === 'tool-check' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Lỗi soát tool → đơn tự đẩy về Support (tab "Soát tool").
              </p>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label className="text-xs">Mô tả lỗi {noteRequired && <span className="text-destructive">*</span>}</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
              placeholder={
                noteRequired ? 'Bắt buộc khi chọn "Lỗi khác" — mô tả cụ thể' : 'Mô tả ngắn gọn lỗi gặp phải (tùy chọn)'
              }
            />
            <div className="text-right text-[10px] text-muted-foreground">
              {note.length}/{MAX_NOTE}
            </div>
          </div>

          {/* Đẩy về công đoạn — "Soát tool" luôn khả dụng; Designer + stage trước
              chỉ khi đơn đã vào fulfillment. */}
          <div className="space-y-2 pt-1 border-t">
            <Label className="text-xs flex items-center gap-1.5">
              <RotateCcw size={12} />
              Đẩy về công đoạn <span className="text-muted-foreground font-normal">(mặc định Soát tool)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              <ChipButton
                active={reworkTarget === 'tool-check'}
                onClick={() => {
                  setReworkTarget('tool-check');
                  setSource('tool-check');
                }}
                label="Soát tool"
              />
              {canReworkBack && (
                <ChipButton
                  active={reworkTarget === 'designer'}
                  onClick={() => setReworkTarget('designer')}
                  label="Designer"
                />
              )}
              {canReworkBack &&
                previousStages.map((s) => (
                  <ChipButton
                    key={s}
                    active={reworkTarget === s}
                    onClick={() => setReworkTarget(s)}
                    label={FULFILLMENT_STAGE_LABELS[s]}
                  />
                ))}
            </div>
            {reworkTarget === 'tool-check' ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Đơn sẽ được đẩy về Support (tab "Soát tool")
              </p>
            ) : (
              reworkTarget !== 'none' && (
                <p className="text-[11px] text-muted-foreground">
                  Mô tả lỗi sẽ được dùng làm lý do rework. Nếu trống, mặc định "Gán lỗi qua màn hình quét".
                </p>
              )
            )}
            {isCompleted && reworkTarget !== 'tool-check' && reworkTarget !== 'none' && (
              <div className="rounded-md border border-dashed border-sky-300/50 bg-sky-50/40 dark:bg-sky-500/5 p-2 text-[11px] text-sky-700 dark:text-sky-300 flex items-start gap-1.5">
                <RotateCcw size={12} className="mt-0.5 shrink-0" />
                <span>Đơn đã hoàn thành fulfillment — đẩy về sẽ mở lại đơn & làm lại từ công đoạn đã chọn.</span>
              </div>
            )}
            {!canReworkBack && reworkTarget !== 'tool-check' && (
              <div className="rounded-md border border-dashed border-amber-300/50 bg-amber-50/40 dark:bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                <ListChecks size={12} className="mt-0.5 shrink-0" />
                <span>Đơn chưa vào fulfillment — chỉ có thể đẩy về Soát tool hoặc mark lỗi.</span>
              </div>
            )}
          </div>
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

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
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
  color: 'sky' | 'violet' | 'amber';
  onClick: () => void;
  label: string;
}) {
  const activeCls =
    color === 'sky'
      ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
      : color === 'violet'
        ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
        : 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  const hoverCls =
    color === 'sky'
      ? 'hover:border-sky-300'
      : color === 'violet'
        ? 'hover:border-violet-300'
        : 'hover:border-amber-300';
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

function ChipButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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
