import { FulfillmentStage } from './fulfillment-stage';

/**
 * Luồng fulfillment của 1 xưởng (field `FactoryEntity.flowType`).
 *
 *  - `standard`: 6 công đoạn tuần tự đầy đủ (mặc định, mọi xưởng hiện có).
 *  - `merged`  : luồng rút gọn cho xưởng gỗ — khi công đoạn GỐC hoàn thành thì
 *    công đoạn GỘP ngay sau nó tự động hoàn thành cùng thời điểm (workMs=0,
 *    người thực hiện = worker công đoạn gốc) và đơn nhảy thẳng tới công đoạn
 *    kế tiếp: In xong → Ép tự xong → QC; May vào xong → May ra tự xong → Đóng
 *    hàng. Xưởng merged KHÔNG cần user giữ 2 công đoạn gộp (Ép, May ra).
 *
 * Rework-back trên xưởng merged: đích là công đoạn gộp bị redirect về công
 * đoạn gốc (`redirectMergedTarget`) — lỗi nhắm về Ép lùi về In, nhắm về May ra
 * lùi về May vào.
 */
export const FactoryFlowType = {
  Standard: 'standard',
  Merged: 'merged',
} as const;
export type FactoryFlowType = (typeof FactoryFlowType)[keyof typeof FactoryFlowType];

export const FACTORY_FLOW_TYPES = [FactoryFlowType.Standard, FactoryFlowType.Merged] as const;

/** Công đoạn GỘP → công đoạn GỐC "gánh" nó. Complete gốc = auto-complete gộp. */
export const MERGED_STAGE_SOURCE: Partial<Record<FulfillmentStage, FulfillmentStage>> = {
  [FulfillmentStage.Press]: FulfillmentStage.Print,
  [FulfillmentStage.SewOut]: FulfillmentStage.SewIn,
};

/** Stage bị gộp trong luồng merged (không bao giờ là `currentFulfillmentStage`). */
export function isMergedStage(stage: FulfillmentStage): boolean {
  return MERGED_STAGE_SOURCE[stage] != null;
}

/** Đích rework-back hợp lệ trên xưởng merged: press→print, sew-out→sew-in, còn lại giữ nguyên. */
export function redirectMergedTarget(target: FulfillmentStage): FulfillmentStage {
  return MERGED_STAGE_SOURCE[target] ?? target;
}
