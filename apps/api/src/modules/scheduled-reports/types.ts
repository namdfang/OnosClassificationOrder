import type { OrderPriority } from 'shared';

/**
 * Loại view báo cáo — mỗi nút Telegram/web trigger 1 view. `daily` kèm
 * `factoryId` = phễu tổng quan LỌC theo 1 xưởng (nút "🏭 <tên xưởng>").
 */
export type ReportKind = 'daily' | 'designer' | 'tool-check';

/** 1 ngày (giờ VN) trong cửa sổ báo cáo — `[from, to)` UTC, `label` dạng `dd/MM`. */
export type ReportDayWindow = {
  label: string;
  from: Date;
  to: Date;
};

/**
 * Số liệu 1 ngày (bucket theo `inProductionAt`, giờ VN — scope MIRROR bảng
 * "Tổng quan N ngày" Dashboard: loại đơn hủy + chưa map xưởng + xưởng US):
 * - `total` — tổng đơn vào sản xuất trong ngày
 * - `stockOut` — đã xong công đoạn Đóng hàng (`fulfillmentCompletedAt`) = xuất kho
 * - 4 trạng thái thiết kế trên đơn ĐÃ GÁN designer (khớp bảng "Tất cả designer
 *   theo ngày"): `needAction` (cần làm/assigned) · `rework` (làm lại) ·
 *   `inProgress` (đang làm) · `done` (đã xong)
 * - `backlog` — tổng tồn thiết kế (`designerFlowConds().backlogCond`: chưa soát
 *   ∪ đã gán chưa xong ∪ đang lỗi chưa gán)
 * - `unassignedNeed` — đang lỗi mà chưa gán designer (dòng "Chưa gán" view designer)
 */
export type ReportDayStats = {
  label: string;
  total: number;
  stockOut: number; // = hoàn thành (fulfillmentCompletedAt) — dùng cho view xưởng + cột "Xong" phễu
  // ── Phễu vòng đời (snapshot: đơn ĐANG ở chặng nào — partition, tổng = `total`) ──
  soat: number; // tồn ở Soát tool (chưa soát: toolResultNote rỗng, chưa vào fulfillment)
  design: number; // tồn ở Thiết kế (đã soát, chưa vào fulfillment)
  inPressQc: number; // currentFulfillmentStage ∈ print/press/qc-post-press
  sew: number; // ∈ sew-in/sew-out
  pack: number; // = pack (đóng hàng)
  completedWithin2d: number; // hoàn thành trong ≤48h kể từ inProductionAt (tính %2n)
  errorCount: number; // tổng lỗi = "soát lỗi + đẩy về" = poolCond (khớp hàng Tổng lỗi Dashboard)
  needAction: number;
  rework: number;
  inProgress: number;
  done: number;
  backlog: number;
  unassignedNeed: number;
};

/** 1 khách ưu tiên (cấu hình ở `/adm/settings/customer-priority`) + số liệu từng ngày trong cửa sổ báo cáo. */
export type PriorityCustomerReportRow = {
  priority: OrderPriority;
  userSku: string;
  userEmail: string;
  days: ReportDayStats[];
};

/** 1 designer trong 1 ngày (view "Theo designer" — mirror ma trận `getTeamDailyBreakdown`). */
export type DesignerDayRow = {
  fullName: string;
  errorCount: number; // per-designer: số đơn TỪNG bị soát tool ra lỗi (toolErrHasCond)
  needAction: number;
  rework: number;
  inProgress: number;
  done: number;
};

/** 1 ngày trong view "Theo designer". */
export type DesignerReportDay = {
  label: string;
  rows: DesignerDayRow[];
  unassignedNeed: number;
};

/** Số liệu soát tool 1 ngày (mirror bảng "Tổng quan theo ngày" tab Soát tool). */
export type ToolCheckReportDay = {
  label: string;
  total: number; // tổng đơn
  unreviewed: number; // chưa soát (toolResultNote rỗng)
  reviewed: number; // đã soát (= total − unreviewed)
  noteNotOk: number; // Note không ok (toolCheckErrorNotes non-empty — từng soát ra lỗi)
  reviewedOk: number; // Soát OK (đã soát & chưa từng lỗi)
  rework: number; // Cần làm lại (productionErrorSource='tool-check' & note='error')
};

/** Xưởng sản xuất (nút "🏭 <tên>" trên keyboard) — 1 nút/xưởng, callback `rpt:fac:<id>`. */
export type ReportFactory = { id: string; name: string };

/** Toàn bộ dữ liệu 1 lần aggregate — các view format từ các lát cắt khác nhau. */
export type DailyOrdersReportData = {
  days: ReportDayStats[];
  priorityRows: PriorityCustomerReportRow[];
  designerDays: DesignerReportDay[];
  toolCheckDays: ToolCheckReportDay[];
  factories: ReportFactory[]; // để dựng nút xưởng (KHÔNG phụ thuộc factoryId đang lọc)
};
