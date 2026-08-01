import { DesignerStatus } from 'shared';

/**
 * Bộ điều kiện aggregation dùng chung của flow designer (lăng kính tồn).
 * Dùng bởi `DesignerStatsService.getDailyOverview` (bảng Tổng quan N ngày),
 * `getSidebarCounts` (badge sidebar) và `DailyOrdersAggregator` (báo cáo
 * Telegram 3 ngày) — sửa công thức ở ĐÂY để mọi nơi luôn khớp số.
 */
export function designerFlowConds() {
  const noteExpr = { $ifNull: ['$toolResultNote', ''] };
  const statusExpr = { $ifNull: ['$designerStatus', DesignerStatus.Unassigned] };
  // Đơn ĐANG lỗi (note set & ≠ ok) / từng bị soát ra lỗi / assignee rỗng.
  const curErrorCond = { $and: [{ $ne: [noteExpr, ''] }, { $ne: [noteExpr, 'ok'] }] };
  const toolErrHasCond = { $gt: [{ $size: { $ifNull: ['$toolCheckErrorNotes', []] } }, 0] };
  const assigneeExpr = { $ifNull: ['$assignee', ''] };
  // designerStatus thuộc 4 trạng thái làm việc (đã vào flow designer).
  const s4Cond = {
    $in: [statusExpr, [DesignerStatus.Assigned, DesignerStatus.InProgress, DesignerStatus.Rework, DesignerStatus.Done]],
  };
  // "Đã gán designer" — MIRROR match của getTeamDailyBreakdown (assignee set +
  // designerStatus ∈ 4 trạng thái) để assignedToolError + assignedWasOk =
  // Tổng/ngày bảng "Tất cả designer theo ngày" chính xác từng ngày.
  const assignedCond = { $and: [{ $ne: [assigneeExpr, ''] }, s4Cond] };
  // Pool cần/qua designer + 2 lát cắt dùng chung cho unassignedNeed & backlog.
  const poolCond = { $or: [toolErrHasCond, s4Cond] };
  const unassignedNeedCond = { $and: [poolCond, { $not: [assignedCond] }, curErrorCond] };
  // Đã gán & CHƯA xong (assigned/in-progress/rework) = assignedTotal − designDone.
  const pendingAssignedCond = {
    $and: [
      { $ne: [assigneeExpr, ''] },
      { $in: [statusExpr, [DesignerStatus.Assigned, DesignerStatus.InProgress, DesignerStatus.Rework]] },
    ],
  };
  // Tổng tồn (lăng kính designer) = UNION: chưa soát ∨ đã gán chưa xong ∨
  // đang lỗi chưa gán — đơn thuộc 2 nhóm chỉ đếm 1 lần.
  const backlogCond = { $or: [{ $eq: [noteExpr, ''] }, pendingAssignedCond, unassignedNeedCond] };
  return {
    noteExpr,
    statusExpr,
    assigneeExpr,
    curErrorCond,
    toolErrHasCond,
    s4Cond,
    assignedCond,
    poolCond,
    unassignedNeedCond,
    pendingAssignedCond,
    backlogCond,
  };
}
