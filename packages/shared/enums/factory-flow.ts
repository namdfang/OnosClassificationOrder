import { FULFILLMENT_STAGE_ORDER, FULFILLMENT_STAGES, FulfillmentStage } from './fulfillment-stage';

/**
 * Luồng fulfillment của 1 xưởng (field `FactoryEntity.flowType`).
 *
 *  - `standard`: 6 công đoạn tuần tự đầy đủ (mặc định, mọi xưởng hiện có).
 *  - `merged`  : luồng rút gọn xưởng gỗ — In xong → Ép tự xong → QC;
 *    May vào xong → May ra tự xong → Đóng hàng.
 *  - `no-sew`  : luồng bỏ may (xưởng Mê Linh) — QC sau ép xong → May vào +
 *    May ra tự xong → Đóng hàng (Đóng hàng vẫn xác nhận tay).
 *
 * Cơ chế chung: mỗi flowType có 1 tập AUTO-STAGE (`FACTORY_FLOW_AUTO_STAGES`).
 * Khi 1 công đoạn hoàn thành, mọi công đoạn KẾ TIẾP LIÊN TỤC nằm trong tập
 * auto được tự hoàn thành cùng thời điểm (workMs=0, người thực hiện = worker
 * công đoạn vừa xong) rồi đơn dừng ở công đoạn thường đầu tiên sau đó.
 * Auto-stage không bao giờ là `currentFulfillmentStage` — xưởng không cần
 * user giữ các công đoạn này.
 *
 * Rework-back: đích là auto-stage bị redirect lùi về công đoạn thường gần
 * nhất phía trước (`redirectAutoTarget`) — vd xưởng gỗ lỗi nhắm về Ép lùi về
 * In; xưởng no-sew lỗi nhắm về May vào/May ra lùi về QC sau ép.
 */
export const FactoryFlowType = {
  Standard: 'standard',
  Merged: 'merged',
  NoSew: 'no-sew',
} as const;
export type FactoryFlowType = (typeof FactoryFlowType)[keyof typeof FactoryFlowType];

export const FACTORY_FLOW_TYPES = [FactoryFlowType.Standard, FactoryFlowType.Merged, FactoryFlowType.NoSew] as const;

/** Tập công đoạn TỰ HOÀN THÀNH theo từng flowType. */
export const FACTORY_FLOW_AUTO_STAGES: Record<FactoryFlowType, readonly FulfillmentStage[]> = {
  [FactoryFlowType.Standard]: [],
  [FactoryFlowType.Merged]: [FulfillmentStage.Press, FulfillmentStage.SewOut],
  [FactoryFlowType.NoSew]: [FulfillmentStage.SewIn, FulfillmentStage.SewOut],
};

/**
 * Stage tự hoàn thành trong flow này (không bao giờ là `currentFulfillmentStage`).
 *
 * `autoPack` — toggle RIÊNG theo xưởng (`FactoryEntity.autoCompletePack`,
 * độc lập với flowType): bật thì công đoạn ĐÓNG HÀNG cũng tự hoàn thành khi
 * đơn chảy tới (đơn xong luôn fulfillment — set `fulfillmentCompletedAt`,
 * bắn `order.production_completed` như đóng tay).
 */
export function isAutoStage(flow: FactoryFlowType, stage: FulfillmentStage, autoPack = false): boolean {
  if (autoPack && stage === FulfillmentStage.Pack) return true;
  return FACTORY_FLOW_AUTO_STAGES[flow].includes(stage);
}

/**
 * Đích rework-back hợp lệ theo flow: đích là auto-stage thì lùi về công đoạn
 * thường gần nhất phía trước; đích thường giữ nguyên. Flow standard trả
 * nguyên `target` (trừ khi `autoPack` và target = Đóng hàng).
 */
export function redirectAutoTarget(flow: FactoryFlowType, target: FulfillmentStage, autoPack = false): FulfillmentStage {
  let idx = FULFILLMENT_STAGE_ORDER[target];
  while (idx > 0) {
    const stage = FULFILLMENT_STAGES[idx];
    if (!stage || !isAutoStage(flow, stage, autoPack)) break;
    idx -= 1;
  }
  return FULFILLMENT_STAGES[idx] ?? target;
}
