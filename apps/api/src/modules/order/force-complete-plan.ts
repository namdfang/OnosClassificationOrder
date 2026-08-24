import type { FactoryFlowType } from 'shared';
import { DesignerStatus, FULFILLMENT_STAGES, isAutoStage } from 'shared';

/**
 * Lập lịch cho thao tác **"Chuyển hoàn thành"** (SuperAdmin ép 1 đơn về trạng
 * thái đã hoàn thành sản xuất — `Orders.md §23`).
 *
 * Quy tắc: chia ĐỀU khoảng `[mốc bắt đầu → lúc bấm]` cho các khâu CHƯA xong
 * của đơn, theo đúng luồng của xưởng đang giữ đơn.
 *
 * Ba điều luôn giữ, và cả ba đều là lý do hàm này tách riêng khỏi service để
 * test được không cần DB:
 *
 *  1. **Không ghi đè lịch sử thật.** Khâu đã có `completedAt` thật thì giữ
 *     nguyên; mốc sinh ra không bao giờ nằm trước mốc thật cuối cùng đã có
 *     trên đơn (nếu không, đơn sẽ có chuỗi thời gian chạy ngược).
 *  2. **Kết thúc đúng lúc bấm.** Khâu cuối luôn đóng đúng `now` — tính bằng
 *     `now` chứ không cộng dồn `n × slice`, để sai số chia không đẩy mốc cuối
 *     lệch khỏi `fulfillmentCompletedAt`.
 *  3. **Tôn trọng luồng rút gọn của xưởng.** Khâu tự-hoàn-thành
 *     (`FACTORY_FLOW_AUTO_STAGES`: xưởng gỗ Ép/May ra, xưởng no-sew May
 *     vào/May ra) KHÔNG chiếm một lát thời gian nào — nó đóng cùng mốc với
 *     khâu ngay trước, y như khi chạy thật.
 */

/** 1 khâu được điền mốc, theo thứ tự dòng chảy của đơn. */
export interface ForceCompleteStep {
  /** `tool-check` | `designer` | 1 trong 6 `FulfillmentStage`. */
  key: string;
  /** Mốc VÀO khâu — chỉ dùng cho các mốc còn trống (`waitingAt`/`startedAt`…). */
  from: Date;
  /** Mốc XONG khâu. */
  to: Date;
  /** Khâu tự-hoàn-thành của luồng rút gọn — dồn vào mốc khâu trước, không chiếm lát. */
  auto: boolean;
}

export interface ForceCompletePlan {
  /** Mốc bắt đầu chia đều (đã kẹp trong `[mốc thật cuối cùng, now]`). */
  start: Date;
  end: Date;
  /** CHỈ các khâu chưa xong. Khâu đã xong không xuất hiện ở đây. */
  steps: ForceCompleteStep[];
}

export interface ForceCompleteSource {
  now: Date;
  inProductionAt?: Date | null;
  orderAt?: Date | null;
  createdAt?: Date | null;
  flowType: FactoryFlowType;
  toolCheckedAt?: Date | null;
  toolResultNote?: string | null;
  designerStatus?: string | null;
  designerCompletedAt?: Date | null;
  fulfillmentStages?: Record<string, { completedAt?: Date | null } | undefined>;
}

const toDate = (v?: Date | string | null): Date | undefined => {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const maxDate = (dates: Array<Date | undefined>): Date | undefined =>
  dates.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];

export function planForceComplete(src: ForceCompleteSource): ForceCompletePlan {
  const now = src.now;

  // Mốc gốc = lúc đơn vào sản xuất. Đơn cũ thiếu `inProductionAt` thì lùi dần
  // sang `orderAt` → `createdAt`; hết đường thì mọi mốc dồn về `now` (thà cụm
  // lại một chỗ còn hơn bịa ra một quá khứ không có căn cứ nào).
  const base = toDate(src.inProductionAt) ?? toDate(src.orderAt) ?? toDate(src.createdAt) ?? now;

  const stageDone = FULFILLMENT_STAGES.map((s) => toDate(src.fulfillmentStages?.[s]?.completedAt));
  const lastKnown = maxDate([toDate(src.toolCheckedAt), toDate(src.designerCompletedAt), ...stageDone]);

  let start = maxDate([base, lastKnown]) ?? now;
  if (start.getTime() > now.getTime()) start = now;

  const pending: Array<{ key: string; auto: boolean }> = [];
  if (!toDate(src.toolCheckedAt) || !(src.toolResultNote ?? '').trim()) {
    pending.push({ key: 'tool-check', auto: false });
  }
  if (src.designerStatus !== DesignerStatus.Done || !toDate(src.designerCompletedAt)) {
    pending.push({ key: 'designer', auto: false });
  }
  for (const stage of FULFILLMENT_STAGES) {
    if (toDate(src.fulfillmentStages?.[stage]?.completedAt)) continue;
    pending.push({ key: stage, auto: isAutoStage(src.flowType, stage) });
  }

  const slotCount = pending.filter((p) => !p.auto).length;
  const span = Math.max(0, now.getTime() - start.getTime());
  const slice = slotCount > 0 ? span / slotCount : 0;

  let cursor = start;
  let filled = 0;
  const steps = pending.map<ForceCompleteStep>((p) => {
    if (p.auto) return { key: p.key, from: cursor, to: cursor, auto: true };
    const from = cursor;
    filled += 1;
    // Lát cuối lấy thẳng `now` — cộng dồn `filled × slice` sẽ lệch vài ms.
    const to = filled === slotCount ? now : new Date(start.getTime() + Math.round(filled * slice));
    cursor = to;
    return { key: p.key, from, to, auto: false };
  });

  return { start, end: now, steps };
}
