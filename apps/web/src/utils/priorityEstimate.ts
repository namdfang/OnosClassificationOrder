import type { LifecycleStageKey } from 'shared';
import { ORDER_PRIORITY_STAGE_ESTIMATE_HOURS, OrderPriority } from 'shared';

/**
 * Hạn dự kiến của 1 bước = thời điểm đơn VÀO bước đó (`enteredAt` — waitingAt/
 * startedAt/designerAssignedAt tuỳ nơi gọi) + số giờ cấu hình theo (mức ưu
 * tiên, bước) — xem `ORDER_PRIORITY_STAGE_ESTIMATE_HOURS`. Không có priority
 * hoặc chưa có mốc vào bước → không có hạn (đơn thường, không hiện estimate).
 */
export function getStageDeadline(
  priority: OrderPriority | number | null | undefined,
  stageKey: LifecycleStageKey,
  enteredAt?: Date | string | null,
): Date | undefined {
  if (!priority || !enteredAt) return undefined;
  const hours = ORDER_PRIORITY_STAGE_ESTIMATE_HOURS[priority as OrderPriority]?.[stageKey];
  if (!hours) return undefined;
  return new Date(new Date(enteredAt).getTime() + hours * 60 * 60 * 1000);
}

/** "2h30p" / "45p" / "1ng 3h" — dùng cho chip đếm ngược, không lộ số 0 thừa. */
function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}ng ${hours}h`;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}p`;
  if (minutes > 0) return `${minutes}p`;
  return '<1p';
}

/** Đếm ngược tới hạn — "Còn 2h30p" hoặc "Quá hạn 45p" (đỏ) khi đã qua `deadline`. */
export function formatCountdown(deadline: Date, now: Date = new Date()): { text: string; overdue: boolean } {
  const diffMs = deadline.getTime() - now.getTime();
  const overdue = diffMs <= 0;
  return { text: `${overdue ? 'Quá hạn' : 'Còn'} ${formatDuration(Math.abs(diffMs))}`, overdue };
}

/** Đơn tối thiểu cần để suy ra bước hiện tại đang active (workshop table). */
export type ActiveStageRow = {
  designerStatus?: string;
  currentFulfillmentStage?: string | null;
};

/**
 * Suy bước hiện tại đơn đang nằm (cho cột "Ưu tiên" ở Bảng Workshop — kanban
 * card đã biết sẵn stage của chính mình nên không cần helper này).
 *
 * `unassigned`/thiếu `designerStatus` = đơn CHƯA chạy bước nào — vẫn tính là
 * đang "chờ" bước `designer` (bước đầu tiên) để estimate hiện ngay từ lúc vào
 * sản xuất, thay vì đợi tới khi có người nhận mới bắt đầu đếm ngược.
 */
export function getActiveStageKey(row: ActiveStageRow): LifecycleStageKey | undefined {
  if (row.currentFulfillmentStage) return row.currentFulfillmentStage as LifecycleStageKey;
  if (
    !row.designerStatus ||
    row.designerStatus === 'unassigned' ||
    row.designerStatus === 'assigned' ||
    row.designerStatus === 'in-progress' ||
    row.designerStatus === 'rework'
  ) {
    return 'designer';
  }
  return undefined;
}
