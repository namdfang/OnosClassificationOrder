import type { TFunction } from 'i18next';
import type { FulfillmentStage, LifecycleStageKey } from 'shared';
import { DesignerStatus, FULFILLMENT_STAGE_ORDER, LIFECYCLE_STAGE_KEYS } from 'shared';

/**
 * Trạng thái HIỆN TẠI của 1 đơn — nhãn ở cột "Trạng thái" của các bảng đơn
 * (Orders.md §24).
 *
 * MIRROR `computeCurrentStage()` ở BE (`customer-order.service.ts`) để cùng 1
 * đơn thì bảng nội bộ, Customer Portal và trang tra cứu công khai không nói
 * hai chuyện khác nhau — đổi luật ở đây phải đổi cả bên kia. Khác biệt duy
 * nhất: bản FE này còn phân biệt trạng thái CON trong 1 chặng (chờ / đang làm
 * / làm lại) vì người trong xưởng cần biết đơn đang kẹt KIỂU GÌ, không chỉ kẹt
 * ở đâu.
 *
 * Tính hoàn toàn từ field `GET /v1/orders` đã trả sẵn — KHÔNG gọi thêm API.
 * Trạng thái "Đang giữ" (hold) CỐ Ý không nằm ở đây: hold là cờ chồng lên
 * chặng (gỡ giữ thì đơn về đúng chặng cũ), đã có `HeldBadge` riêng cạnh mã đơn.
 */
export type OrderStatusRow = {
  cancelledAt?: string | null;
  toolResultNote?: string;
  designerStatus?: string;
  currentFulfillmentStage?: string | null;
  fulfillmentStages?: Record<string, ({ status?: string } & Record<string, unknown>) | undefined>;
  fulfillmentCompletedAt?: string | null;
};

export type OrderStatusTone = 'neutral' | 'active' | 'warn' | 'danger' | 'success';

export type OrderStatusInfo = {
  /** `LIFECYCLE_STAGE_KEYS` | 'done' | 'cancelled' — dùng cho test/telemetry. */
  key: string;
  label: string;
  /** Câu giải thích đầy đủ cho tooltip (chặng + trạng thái con). */
  tooltip: string;
  tone: OrderStatusTone;
};

export const ORDER_STATUS_TONE_CLASS: Record<OrderStatusTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  active: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

/**
 * Hàm dịch truyền vào `getOrderStatusInfo` — cùng khuôn với helper `tr()` của
 * `workshopTableConfig.tsx`: `render()` của cột KHÔNG phải component nên không
 * gọi được `useTranslation`, phải nhận `t` từ ngoài (và có thể không có `t`).
 */
export type OrderStatusTranslate = (key: string, fallback: string, vars?: Record<string, unknown>) => string;

/** Thay `{{var}}` trong chuỗi fallback khi không có i18n. */
function interpolate(text: string, vars?: Record<string, unknown>): string {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Bọc `t` (namespace `orders`) thành `OrderStatusTranslate`; thiếu `t` → fallback tiếng Việt. */
export function makeOrderStatusTranslate(t?: TFunction<'orders'>): OrderStatusTranslate {
  return (key, fallback, vars) => (t ? t(key, { defaultValue: fallback, ...vars }) : interpolate(fallback, vars));
}

/** Nhãn ngắn của 8 chặng — cùng bộ chữ với phễu Vòng đời đơn. */
const STAGE_FALLBACK: Record<LifecycleStageKey, string> = {
  'tool-check': 'soát tool',
  designer: 'thiết kế',
  print: 'in',
  press: 'ép',
  'qc-post-press': 'QC sau ép',
  'sew-in': 'may vào',
  'sew-out': 'may ra',
  pack: 'đóng hàng',
};

/**
 * Chặng đang active — mirror `computeCurrentStage()`: ưu tiên
 * `currentFulfillmentStage`, rồi tới `designerStatus`, cuối cùng suy từ
 * `toolResultNote` (rỗng = chưa soát tool xong).
 */
function activeStageKey(row: OrderStatusRow): LifecycleStageKey {
  if (row.currentFulfillmentStage) {
    const idx = FULFILLMENT_STAGE_ORDER[row.currentFulfillmentStage as FulfillmentStage];
    if (idx !== undefined) return LIFECYCLE_STAGE_KEYS[2 + idx];
  }
  if (row.designerStatus && row.designerStatus !== DesignerStatus.Unassigned) {
    return row.designerStatus === DesignerStatus.Done ? LIFECYCLE_STAGE_KEYS[2] : LIFECYCLE_STAGE_KEYS[1];
  }
  return row.toolResultNote ? LIFECYCLE_STAGE_KEYS[1] : LIFECYCLE_STAGE_KEYS[0];
}

export function getOrderStatusInfo(row: OrderStatusRow, tr: OrderStatusTranslate): OrderStatusInfo {
  if (row.cancelledAt) {
    const label = tr('statusLabel.cancelled', 'Đã hủy');
    return { key: 'cancelled', label, tooltip: label, tone: 'danger' };
  }
  if (row.fulfillmentCompletedAt) {
    return {
      key: 'done',
      label: tr('statusLabel.done', 'Hoàn thành'),
      tooltip: tr('statusLabel.doneTooltip', 'Đã đóng hàng xong — đơn ra khỏi xưởng'),
      tone: 'success',
    };
  }

  const key = activeStageKey(row);
  const stage = tr(`statusLabel.stage.${key}`, STAGE_FALLBACK[key]);
  const waiting = (tooltip: string): OrderStatusInfo => ({
    key,
    label: tr('statusLabel.waitingAt', 'Chờ {{stage}}', { stage }),
    tooltip,
    tone: 'neutral',
  });

  if (key === 'tool-check') {
    return waiting(tr('statusLabel.toolCheckTooltip', 'Chưa soát tool xong — đơn chưa vào chặng thiết kế'));
  }

  // Chặng thiết kế: trạng thái con lấy từ `designerStatus`.
  if (key === 'designer') {
    switch (row.designerStatus as DesignerStatus | undefined) {
      case DesignerStatus.Rework:
        return {
          key,
          label: tr('statusLabel.reworkAt', 'Làm lại {{stage}}', { stage }),
          tooltip: tr('statusLabel.designerReworkTooltip', 'Xưởng báo lỗi do design — designer đang làm lại'),
          tone: 'warn',
        };
      case DesignerStatus.Rejected:
        return {
          key,
          label: tr('statusLabel.rejectedAt', 'Không làm được ({{stage}})', { stage }),
          tooltip: tr('statusLabel.designerRejectedTooltip', 'Designer báo file không làm được — leader cần giao lại'),
          tone: 'danger',
        };
      case DesignerStatus.InProgress:
        return {
          key,
          label: tr('statusLabel.workingAt', 'Đang {{stage}}', { stage }),
          tooltip: tr('statusLabel.designerWorkingTooltip', 'Designer đang xử lý file'),
          tone: 'active',
        };
      case DesignerStatus.Assigned:
        return {
          key,
          label: tr('statusLabel.assignedAt', 'Đã giao {{stage}}', { stage }),
          tooltip: tr('statusLabel.designerAssignedTooltip', 'Đã giao designer, designer chưa nhận làm'),
          tone: 'active',
        };
      default:
        return waiting(tr('statusLabel.designerUnassignedTooltip', 'Chưa gán designer nào'));
    }
  }

  // 6 chặng fulfillment: trạng thái con lấy từ `fulfillmentStages[key].status`.
  const st = row.fulfillmentStages?.[key]?.status;
  if (st === 'rework')
    return {
      key,
      label: tr('statusLabel.reworkAt', 'Làm lại {{stage}}', { stage }),
      tooltip: tr('statusLabel.stageReworkTooltip', 'Công đoạn sau báo lỗi — {{stage}} phải làm lại', { stage }),
      tone: 'warn',
    };
  if (st === 'in-progress')
    return {
      key,
      label: tr('statusLabel.workingAt', 'Đang {{stage}}', { stage }),
      tooltip: tr('statusLabel.stageWorkingTooltip', 'Công nhân đang làm công đoạn {{stage}}', { stage }),
      tone: 'active',
    };
  return waiting(tr('statusLabel.stageWaitingTooltip', 'Đơn đã tới công đoạn {{stage}}, chưa ai bấm Bắt đầu', { stage }));
}
