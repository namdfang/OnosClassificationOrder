import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import dayjs from 'dayjs';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  ImageIcon,
  MessageSquareWarning,
  PlayCircle,
  RotateCcw,
  XOctagon,
} from 'lucide-react';
import type { FulfillmentStageState, ProductionOrder } from 'shared';
import { FULFILLMENT_STAGE_LABELS, FulfillmentStage, FulfillmentStageStatus } from 'shared';

import { Hint } from '@/components/common/Hint';

/**
 * Card đơn fulfillment — design ngang hàng `pages/designer/my-tasks/TaskCard.tsx`
 * để 2 page có trải nghiệm thị giác đồng bộ.
 *
 * Khác biệt so với Designer:
 *   - Action buttons inline (Bắt đầu / Hoàn thành / Báo lỗi) vì fulfillment chỉ
 *     có 4 column = status; không có cột "done" để drag tới (complete auto-advance
 *     ra ngoài view), rework-back cần dialog input lý do.
 *   - DnD chỉ enable cho waiting / rework cards (drop vào in-progress = start).
 *   - Không có "rejected" status (chỉ designer có).
 *
 * Cùng với Designer:
 *   - Mockup thumbnail click → preview to.
 *   - ProductionId click → optional detail dialog.
 *   - Time stamp + reworkCount + productionErrorNote layout y hệt.
 *   - Type / size / color line.
 */
type ColKey = 'waiting' | 'in-progress' | 'rework' | 'done' | 'watching';

export interface FulfillmentTaskCardProps {
  order: ProductionOrder;
  myStage: FulfillmentStage;
  colKey: ColKey;
  onPreview?: (url: string, title: string, originalUrl?: string) => void;
  onClickProductionId?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
  onReportError?: () => void;
}

function smallThumb(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.includes('/designs/preview/')) return url.replace('/designs/preview/', '/designs/thumb/');
  return url;
}

function fmtTime(d?: Date | string): string {
  if (!d) return '—';
  return dayjs(d).format('HH:mm DD/MM');
}

/** Mốc thời gian đại diện cho card theo status — đồng bộ pattern với
 *  `pages/designer/my-tasks/TaskCard.timeStamp()`. */
function timeStamp(
  state: FulfillmentStageState | null,
  status: FulfillmentStageStatus,
): { label: string; value?: Date | string } {
  switch (status) {
    case FulfillmentStageStatus.Waiting:
      return { label: 'Nhận', value: state?.waitingAt };
    case FulfillmentStageStatus.InProgress:
      return { label: 'Bắt đầu', value: state?.startedAt };
    case FulfillmentStageStatus.Rework:
      return { label: 'Quay lại', value: state?.reworkAt };
    case FulfillmentStageStatus.Done:
      return { label: 'Xong', value: state?.completedAt };
    default:
      return { label: '', value: undefined };
  }
}

export function FulfillmentTaskCard({
  order,
  myStage,
  colKey,
  onPreview,
  onClickProductionId,
  onStart,
  onComplete,
  onReportError,
}: FulfillmentTaskCardProps) {
  const state = (order.fulfillmentStages?.[myStage] ?? null) as FulfillmentStageState | null;
  const status = state?.status ?? FulfillmentStageStatus.Waiting;
  const currentStage = order.currentFulfillmentStage as FulfillmentStage | undefined;

  // Chỉ enable drag cho 2 column có rule: waiting/rework → in-progress.
  const canDrag = colKey === 'waiting' || colKey === 'rework';
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order._id,
    data: { col: colKey, status },
    disabled: !canDrag,
  });

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const ts = timeStamp(state, status);
  const url = order.mockupOriginalUrl || order.mockupUrl;
  const thumb = smallThumb(order.mockupUrl);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group rounded-md border bg-card p-2.5 shadow-sm hover:shadow-md transition-shadow ${
        canDrag ? 'cursor-grab active:cursor-grabbing' : ''
      } ${isDragging ? 'opacity-50 ring-2 ring-primary/40' : 'border-border'}`}
    >
      <div className="flex gap-2.5">
        {thumb ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (url) onPreview?.(order.mockupUrl || url, `Mockup ${order.productionId}`, order.mockupOriginalUrl);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0 w-14 h-14 rounded border border-border overflow-hidden bg-checker"
            title="Click để xem to"
          >
            <img
              src={thumb}
              alt=""
              className="w-full h-full object-contain"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </button>
        ) : (
          <div className="shrink-0 w-14 h-14 rounded border border-dashed border-border bg-muted/40 flex items-center justify-center text-muted-foreground">
            <ImageIcon size={18} />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1">
          {onClickProductionId ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClickProductionId();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="font-mono text-xs font-semibold text-foreground hover:text-primary hover:underline truncate text-left"
            >
              {order.productionId}
            </button>
          ) : (
            <div className="font-mono text-xs font-semibold text-foreground truncate">
              {order.productionId}
            </div>
          )}

          {order.type && (
            <Hint content={`Type: ${order.type}`} forceRich>
              <div className="text-[11px] text-foreground line-clamp-1">{order.type}</div>
            </Hint>
          )}
          <div className="text-[10px] text-muted-foreground line-clamp-1">
            {order.size || '—'}
            {order.color && <> · {order.color}</>}
            {' · '}qty {order.quantity}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
            {ts.value && (
              <Hint content={`${ts.label} lúc ${fmtTime(ts.value)} (${dayjs(ts.value).fromNow()})`} forceRich>
                <span className="inline-flex items-center gap-1">
                  <Clock size={10} /> {ts.label}: {fmtTime(ts.value)}
                </span>
              </Hint>
            )}
            {state?.reworkCount && state.reworkCount > 0 ? (
              <Hint content={`Đơn này đã rework ${state.reworkCount} lần`} forceRich>
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <RotateCcw size={10} /> ×{state.reworkCount}
                </span>
              </Hint>
            ) : null}
          </div>

          {colKey === 'watching' && (
            <div className="text-[10px] text-sky-700 dark:text-sky-300 inline-flex items-center gap-1">
              <ChevronRight size={11} />
              Đang ở:{' '}
              <strong>
                {order.designerStatus === 'rework'
                  ? 'Designer (rework)'
                  : currentStage
                    ? FULFILLMENT_STAGE_LABELS[currentStage]
                    : '—'}
              </strong>
            </div>
          )}

          {status === FulfillmentStageStatus.Rework && order.productionErrorNote && (
            <div className="flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded px-1.5 py-1">
              <MessageSquareWarning size={11} className="shrink-0 mt-px" />
              <span className="line-clamp-2">{order.productionErrorNote}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons inline — opacity-hover cho gọn, mở rộng full khi cần thao tác */}
      {colKey !== 'watching' && (status === FulfillmentStageStatus.Waiting ||
        status === FulfillmentStageStatus.Rework ||
        status === FulfillmentStageStatus.InProgress) && (
        <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-border/40">
          {(status === FulfillmentStageStatus.Waiting || status === FulfillmentStageStatus.Rework) &&
            onStart && (
              <CardAction
                color="indigo"
                icon={PlayCircle}
                label="Bắt đầu"
                onClick={onStart}
              />
            )}
          {status === FulfillmentStageStatus.InProgress && onComplete && (
            <CardAction color="emerald" icon={CheckCircle2} label="Hoàn thành" onClick={onComplete} />
          )}
          {status === FulfillmentStageStatus.InProgress && onReportError && (
            <CardAction color="rose" icon={XOctagon} label="Báo lỗi" onClick={onReportError} />
          )}
        </div>
      )}
    </div>
  );
}

/** Mini button trong card — gọn gàng giống pattern Tag/Trả ở Designer kanban. */
function CardAction({
  color,
  icon: Icon,
  label,
  onClick,
}: {
  color: 'indigo' | 'emerald' | 'rose';
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  const colorCls = {
    indigo: 'text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10',
    emerald: 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10',
    rose: 'text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10',
  }[color];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${colorCls}`}
    >
      <Icon size={12} /> {label}
    </button>
  );
}
