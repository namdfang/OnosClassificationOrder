import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Clock, Factory, History, ImageIcon, RotateCcw, MessageSquareWarning } from 'lucide-react';
import type { DesignerTaskCard as Card } from 'shared';
import { DesignerStatus, WorkshopConfigCategory } from 'shared';

import { CopyButton } from '@/components/common/CopyButton';
import { Hint } from '@/components/common/Hint';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { cn } from '@/utils/cn';

interface Props {
  card: Card;
  onPreview?: (url: string, title: string, originalUrl?: string) => void;
  /** Click productionId → mở detail dialog (giữ drag riêng nhờ stopPropagation pointerDown). */
  onClickProductionId?: () => void;
}

function smallThumb(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.includes('/designs/preview/')) return url.replace('/designs/preview/', '/designs/thumb/');
  return url;
}

function timeStamp(card: Card): { label: string; value: Date | undefined } {
  switch (card.designerStatus) {
    case DesignerStatus.Assigned:
      return { label: 'Gán', value: card.designerAssignedAt };
    case DesignerStatus.InProgress:
      return { label: 'Bắt đầu', value: card.designerStartedAt };
    case DesignerStatus.Done:
      return { label: 'Xong', value: card.designerCompletedAt };
    case DesignerStatus.Rework:
      return { label: 'Lỗi xưởng', value: card.designerReworkAt };
    case DesignerStatus.Rejected:
      return { label: 'Không làm được', value: card.designerRejectedAt };
    default:
      return { label: '', value: undefined };
  }
}

function fmtTime(d?: Date): string {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    hour12: false,
  });
}

/** Đầy đủ hơn cho tooltip — kèm năm + giây. */
function fmtFull(d?: Date): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  });
}

/** Giải thích mốc thời gian theo trạng thái — dùng cho tooltip. */
function statusTimeHint(status: DesignerStatus): string {
  switch (status) {
    case DesignerStatus.Assigned:
      return 'Thời điểm bạn được giao task này';
    case DesignerStatus.InProgress:
      return 'Thời điểm bắt đầu làm';
    case DesignerStatus.Done:
      return 'Thời điểm hoàn thành';
    case DesignerStatus.Rework:
      return 'Thời điểm xưởng báo lỗi (cần làm lại)';
    case DesignerStatus.Rejected:
      return 'Thời điểm báo không làm được';
    default:
      return '';
  }
}

export function TaskCard({ card, onPreview, onClickProductionId }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card._id,
    data: { status: card.designerStatus },
  });

  const style = transform
    ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    }
    : undefined;

  const ts = timeStamp(card);
  const url = card.mockupOriginalUrl || card.mockupUrl;
  const thumb = smallThumb(card.mockupUrl);

  // Resolve `toolResultNote` (code) → label + màu từ workshop_config, đồng bộ
  // với ColorBadgeSelectCell ở bảng đơn. Subscribe list để re-render khi store
  // load xong (resolve fn ref ổn định nên phải subscribe list mới re-render).
  const toolNoteItems = useWorkshopConfigStore(
    (s) => s.byCategory[WorkshopConfigCategory.ToolResultNote] || [],
  );
  const toolNoteCfg = card.toolResultNote
    ? toolNoteItems.find((i) => i.code === card.toolResultNote)
    : undefined;

  // Resolve mã "File sửa lỗi" (errorFile[], category error_file_type) → name.
  const errorFileItems = useWorkshopConfigStore(
    (s) => s.byCategory[WorkshopConfigCategory.ErrorFileType] || [],
  );
  const errorFiles = (card.errorFile || []).filter(Boolean);
  const errorFileLabels = errorFiles.map(
    (code) => errorFileItems.find((i) => i.code === code)?.name || code,
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative rounded-md border bg-card p-2.5 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50 ring-2 ring-primary/40' : 'border-border'
        }`}
    >
      <div className="flex gap-2.5">
        {thumb ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (url) onPreview?.(card.mockupUrl || url, `Mockup ${card.productionId}`, card.mockupOriginalUrl);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0 w-14 h-14 rounded border border-border overflow-hidden bg-checker"
            title="Click để xem to"
          >
            <img src={thumb} alt="" className="w-full h-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
          </button>
        ) : (
          <div className="shrink-0 w-14 h-14 rounded border border-dashed border-border bg-muted/40 flex items-center justify-center text-muted-foreground">
            <ImageIcon size={18} />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1">
          {/* productionId + nút copy, kèm note kết quả Tool ở góc trên phải */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 min-w-0 flex-1">
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
                  {card.productionId}
                </button>
              ) : (
                <div className="font-mono text-xs font-semibold text-foreground truncate">{card.productionId}</div>
              )}
              <span className="shrink-0" onPointerDown={(e) => e.stopPropagation()}>
                <CopyButton value={card.productionId ?? ''} label={`mã ${card.productionId}`} iconSize={12} />
              </span>
            </div>
            {card.toolResultNote && (
              <Hint content={`Note kết quả Tool: ${toolNoteCfg?.name || card.toolResultNote}`} forceRich>
                <span
                  className={cn(
                    'shrink-0 max-w-[45%] truncate rounded border px-1.5 py-0.5 text-[9px] font-medium',
                    !toolNoteCfg && 'border-border/60 bg-muted text-muted-foreground',
                  )}
                  style={
                    toolNoteCfg?.color
                      ? { backgroundColor: toolNoteCfg.color, color: '#fff', borderColor: toolNoteCfg.color }
                      : undefined
                  }
                >
                  {toolNoteCfg?.name || card.toolResultNote}
                </span>
              </Hint>
            )}
          </div>
          {card.type && (
            <Hint content={`Type: ${card.type}`} forceRich>
              <div className="text-[11px] text-foreground line-clamp-1">{card.type}</div>
            </Hint>
          )}
          <div className="text-[10px] text-muted-foreground line-clamp-1">
            {card.size || '—'}
            {card.color && <> · {card.color}</>}
          </div>
        </div>
      </div>

      {/* Hàng thời gian dàn ngang full-width (tận dụng khoảng trống dưới mockup) */}
      <div className="mt-1.5 flex items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground flex-wrap">
        {card.inProductionAt && (
          <Hint content={`Ngày đơn vào sản xuất · ${fmtFull(card.inProductionAt)}`} forceRich>
            <span className="inline-flex items-center gap-1">
              <Factory size={10} className="text-sky-500" /> SX: {fmtTime(card.inProductionAt)}
            </span>
          </Hint>
        )}
        {ts.value && (
          <Hint content={`${statusTimeHint(card.designerStatus)} · ${fmtFull(ts.value)}`} forceRich>
            <span className="inline-flex items-center gap-1">
              <Clock size={10} /> {ts.label} {fmtTime(ts.value)}
            </span>
          </Hint>
        )}
        {/* {card.updatedAt && (
          <Hint content={`Lần cập nhật cuối cùng của đơn · ${fmtFull(card.updatedAt)}`} forceRich>
            <span className="inline-flex items-center gap-1">
              <History size={10} /> Cập nhật: {fmtTime(card.updatedAt)}
            </span>
          </Hint>
        )} */}
        {/* {card.designerReworkCount > 0 && (
          <Hint content={`Đơn này đã rework ${card.designerReworkCount} lần`} forceRich>
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <RotateCcw size={10} /> ×{card.designerReworkCount}
            </span>
          </Hint>
        )} */}
      </div>

      {card.designerStatus === DesignerStatus.Rework && card.productionErrorNote && (
        <div className="mt-1 flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded px-1.5 py-1">
          <MessageSquareWarning size={11} className="shrink-0 mt-px" />
          <span className="line-clamp-2">{card.productionErrorNote}</span>
        </div>
      )}
      {card.designerStatus === DesignerStatus.Rejected && card.designerRejectedReason && (
        <div className="mt-1 text-[10px] text-rose-700 dark:text-rose-300 line-clamp-2">
          <span className="font-medium">Lý do không làm được:</span> {card.designerRejectedReason}
        </div>
      )}

      {/* File sửa lỗi (errorFile[]) — badge từng loại; đồng bộ tên với bảng đơn */}
      {errorFileLabels.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {errorFileLabels.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className="rounded border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[9px] font-medium text-violet-700 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300"
            >
              {label}
            </span>
          ))}
        </div>
      )}
      {/* Ghi chú file lỗi (errorFileNote) */}
      {card.errorFileNote && (
        <div className="mt-1 flex items-start gap-1 text-[10px] text-violet-700 dark:text-violet-300">
          <MessageSquareWarning size={11} className="shrink-0 mt-px" />
          <span className="line-clamp-2">{card.errorFileNote}</span>
        </div>
      )}
    </div>
  );
}
