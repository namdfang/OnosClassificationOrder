/**
 * 6 stage tuần tự sau khi designer mark `done` + readyForFulfill=true.
 *
 *  Print → Press → QCPostPress → SewIn → SewOut → Pack → completed
 *
 * Mỗi stage có đúng 1 worker per factory (BE enforce unique constraint
 * `(factoryId, fulfillmentStage)` trên users collection). Đơn auto-assign cho
 * worker đó qua filter `(factoryId, currentFulfillmentStage)` ở `getOrders`.
 *
 * Refactor history: 5 → 7 → 8 stage rồi rút lại về 6. QC cũ từng tách thành
 * "QC sau ép" + "QC phân hàng kiểm"; May cũ tách thành "May nhận vào" + "May
 * xuất ra"; và thêm "QC sau may". Sau đó **bỏ "QC phân hàng kiểm" (`qc-sorting`)
 * + "QC sau may" (`qc-post-sew`)**: đơn tồn ở `qc-sorting` migrate tiến về
 * `sew-in` (waiting); `qc-post-sew` chưa có đơn nên xoá thẳng. Data cũ mang enum
 * đã bỏ (`qc-sorting`/`qc-post-sew`/`qc`/`sew`) không nằm trong enum mới → cần
 * migrate (xem FulfillmentWorkflow.md).
 */
export enum FulfillmentStage {
  Print = 'print',                  // In
  Press = 'press',                  // Ép
  QCPostPress = 'qc-post-press',    // QC sau ép
  SewIn = 'sew-in',                 // May nhận vào
  SewOut = 'sew-out',               // May xuất ra
  Pack = 'pack',                    // Đóng hàng
}

export const FULFILLMENT_STAGES: FulfillmentStage[] = [
  FulfillmentStage.Print,
  FulfillmentStage.Press,
  FulfillmentStage.QCPostPress,
  FulfillmentStage.SewIn,
  FulfillmentStage.SewOut,
  FulfillmentStage.Pack,
];

/** Index 0-5 để compare thứ tự stage (vd rework-back chỉ cho phép target < current). */
export const FULFILLMENT_STAGE_ORDER: Record<FulfillmentStage, number> = {
  [FulfillmentStage.Print]: 0,
  [FulfillmentStage.Press]: 1,
  [FulfillmentStage.QCPostPress]: 2,
  [FulfillmentStage.SewIn]: 3,
  [FulfillmentStage.SewOut]: 4,
  [FulfillmentStage.Pack]: 5,
};

export const FULFILLMENT_STAGE_LABELS: Record<FulfillmentStage, string> = {
  [FulfillmentStage.Print]: 'In',
  [FulfillmentStage.Press]: 'Ép',
  [FulfillmentStage.QCPostPress]: 'QC sau ép',
  [FulfillmentStage.SewIn]: 'May nhận vào',
  [FulfillmentStage.SewOut]: 'May xuất ra',
  [FulfillmentStage.Pack]: 'Đóng hàng',
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
