/**
 * 5 stage tuần tự sau khi designer mark `done` + readyForFulfill=true.
 *
 *  Print → Press → QC → Sew → Pack → completed
 *
 * Mỗi stage có đúng 1 worker per factory (BE enforce unique constraint
 * `(factoryId, fulfillmentStage)` trên users collection). Đơn auto-assign cho
 * worker đó qua filter `(factoryId, currentFulfillmentStage)` ở `getOrders`.
 */
export enum FulfillmentStage {
  Print = 'print',   // In
  Press = 'press',   // Ép
  QC = 'qc',         // QC
  Sew = 'sew',       // May
  Pack = 'pack',     // Đóng gói
}

export const FULFILLMENT_STAGES: FulfillmentStage[] = [
  FulfillmentStage.Print,
  FulfillmentStage.Press,
  FulfillmentStage.QC,
  FulfillmentStage.Sew,
  FulfillmentStage.Pack,
];

/** Index 0-4 để compare thứ tự stage (vd rework-back chỉ cho phép target < current). */
export const FULFILLMENT_STAGE_ORDER: Record<FulfillmentStage, number> = {
  [FulfillmentStage.Print]: 0,
  [FulfillmentStage.Press]: 1,
  [FulfillmentStage.QC]: 2,
  [FulfillmentStage.Sew]: 3,
  [FulfillmentStage.Pack]: 4,
};

export const FULFILLMENT_STAGE_LABELS: Record<FulfillmentStage, string> = {
  [FulfillmentStage.Print]: 'In',
  [FulfillmentStage.Press]: 'Ép',
  [FulfillmentStage.QC]: 'QC',
  [FulfillmentStage.Sew]: 'May',
  [FulfillmentStage.Pack]: 'Đóng gói',
};

/**
 * State machine của 1 stage:
 *   waiting     → đơn vừa tới stage, chưa worker bấm Bắt đầu
 *   in-progress → worker đang làm
 *   done        → worker bấm Hoàn thành (immutable trong cycle hiện tại)
 *   rework      → đã `done` trước đó, đang chờ làm lại (stage sau đẩy về). Bấm
 *                 Bắt đầu → in-progress, workMs cộng dồn cycle cũ.
 */
export enum FulfillmentStageStatus {
  Waiting = 'waiting',
  InProgress = 'in-progress',
  Done = 'done',
  Rework = 'rework',
}

export const FULFILLMENT_STAGE_STATUSES: FulfillmentStageStatus[] = [
  FulfillmentStageStatus.Waiting,
  FulfillmentStageStatus.InProgress,
  FulfillmentStageStatus.Done,
  FulfillmentStageStatus.Rework,
];

/** Action user trigger qua `POST /v1/orders/:id/fulfillment-transition`. */
export enum FulfillmentTransitionAction {
  /** waiting/rework → in-progress. Lần đầu set `firstStartedAt`; mỗi lần reset `startedAt`. */
  Start = 'start',
  /** in-progress → done. Cộng workMs, auto-advance stage tiếp theo (hoặc set fulfillmentCompletedAt nếu là pack). */
  Complete = 'complete',
  /** in-progress → đẩy đơn về designer hoặc stage trước. Reporter giữ assignee, status → waiting. */
  ReworkBack = 'rework-back',
}

export const FULFILLMENT_TRANSITION_ACTIONS: FulfillmentTransitionAction[] = [
  FulfillmentTransitionAction.Start,
  FulfillmentTransitionAction.Complete,
  FulfillmentTransitionAction.ReworkBack,
];

/** Target khi gọi `rework-back`. `designer` reuse designer rework flow. */
export type ReworkBackTarget = 'designer' | FulfillmentStage;
