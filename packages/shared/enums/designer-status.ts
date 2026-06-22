/**
 * State machine cho task của Designer.
 *
 * - `unassigned` → leader chưa assign, default khi import order
 * - `assigned`   → leader đã assign cho 1 sub-designer cụ thể (qua `assignee`)
 * - `in-progress`→ sub bấm "Nhận làm"
 * - `done`       → sub bấm "Hoàn thành" (auto set toolResultNote='ok' + readyForFulfill=true)
 * - `rejected`   → sub bấm "Trả lại" (kèm reason); leader cần re-assign cho người khác
 * - `rework`     → xưởng set productionError có `errorSource='designer'`; cùng sub-designer làm lại
 *
 * Reassign chỉ cho phép khi đang ở `assigned` hoặc `rejected`.
 */
export enum DesignerStatus {
  Unassigned = 'unassigned',
  Assigned = 'assigned',
  InProgress = 'in-progress',
  Done = 'done',
  Rejected = 'rejected',
  Rework = 'rework',
}

export const DESIGNER_STATUSES = Object.values(DesignerStatus);

/** Đang active task — block delete user / block reassign / block clear assigneeCode. */
export const DESIGNER_ACTIVE_STATUSES: DesignerStatus[] = [
  DesignerStatus.Assigned,
  DesignerStatus.InProgress,
  DesignerStatus.Rework,
];

/** Cho phép reassign sang sub-designer khác. */
export const DESIGNER_REASSIGNABLE_STATUSES: DesignerStatus[] = [
  DesignerStatus.Unassigned,
  DesignerStatus.Assigned,
  DesignerStatus.Rejected,
];

/**
 * Action mà user trigger qua endpoint `POST /v1/orders/:id/designer-transition`.
 * Mapping action → next state phụ thuộc state hiện tại (xem
 * `documents/Plans/Designer-Task-Workflow.md` §1).
 */
export enum DesignerTransitionAction {
  Start = 'start', // assigned/rework → in-progress
  Complete = 'complete', // in-progress → done
  Reject = 'reject', // assigned → rejected
  Restart = 'restart', // rework → in-progress (alias semantic của Start)
}

export const DESIGNER_TRANSITION_ACTIONS = Object.values(DesignerTransitionAction);
