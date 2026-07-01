import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { IDZod, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@shared/constants';
import { DesignerStatus, DesignerTransitionAction, Status } from '@shared/enums';
import { PageResZod, ResZod } from '@shared/types';

/**
 * Designer Task Workflow — DTOs.
 *
 * Identity model: `Order.assignee = user._id (string)`. Sub-designer là user
 * có role `Designer`. Picker "Người thực hiện" load thẳng từ designer team,
 * KHÔNG còn qua workshop_config (legacy assignee category đã xoá).
 */

// ─── Team management (Phase 2) ──────────────────────────────────────

export const DesignerTeamMemberZod = z.object({
  _id: IDZod,
  fullName: z.string(),
  email: z.string(),
  status: z.nativeEnum(Status),
  hireDate: z.date().optional(),
  telegramChatId: z.string().optional(),
  /** Số đơn user đang ôm (designerStatus ∈ {assigned, in-progress, rework}). */
  activeTaskCount: z.number().int().nonnegative(),
  /** Tổng đơn hoàn thành (designerStatus = done). */
  completedTaskCount: z.number().int().nonnegative(),
  createdAt: z.date().optional(),
});
export type DesignerTeamMember = z.infer<typeof DesignerTeamMemberZod>;

export const GetDesignerTeamZod = z.object({
  status: z.nativeEnum(Status).optional(),
});
export class GetDesignerTeamDto extends createZodDto(extendApi(GetDesignerTeamZod)) {}

export const GetDesignerTeamResZod = PageResZod.extend({ data: DesignerTeamMemberZod.array() });
export class GetDesignerTeamResDto extends createZodDto(extendApi(GetDesignerTeamResZod)) {}

export const CreateDesignerTeamMemberZod = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().toLowerCase(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  hireDate: z.coerce.date().optional(),
  telegramChatId: z.string().max(60).optional(),
});
export class CreateDesignerTeamMemberDto extends createZodDto(
  extendApi(CreateDesignerTeamMemberZod),
) {}

export const CreateDesignerTeamMemberResZod = ResZod.extend({ data: DesignerTeamMemberZod });
export class CreateDesignerTeamMemberResDto extends createZodDto(
  extendApi(CreateDesignerTeamMemberResZod),
) {}

export const UpdateDesignerTeamMemberZod = z.object({
  fullName: z.string().min(1).max(120).optional(),
  email: z.string().email().toLowerCase().optional(),
  hireDate: z.coerce.date().nullable().optional(),
  telegramChatId: z.string().max(60).nullable().optional(),
  status: z.nativeEnum(Status).optional(),
});
export class UpdateDesignerTeamMemberDto extends createZodDto(
  extendApi(UpdateDesignerTeamMemberZod),
) {}

export const UpdateDesignerTeamMemberResZod = ResZod.extend({ data: DesignerTeamMemberZod });
export class UpdateDesignerTeamMemberResDto extends createZodDto(
  extendApi(UpdateDesignerTeamMemberResZod),
) {}

export const ResetDesignerPasswordZod = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});
export class ResetDesignerPasswordDto extends createZodDto(extendApi(ResetDesignerPasswordZod)) {}

// ─── My tasks (Phase 4) ─────────────────────────────────────────────

export const DesignerTaskCardZod = z.object({
  _id: IDZod,
  productionId: z.string(),
  orderId: z.string().optional(),
  type: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  mockupUrl: z.string().optional(),
  mockupOriginalUrl: z.string().optional(),
  /** workshop_config code — FE resolve label qua store nếu cần đẹp hơn. */
  fabricType: z.string().optional(),
  machineNumber: z.string().optional(),
  toolResult: z.string().optional(),
  toolResultNote: z.string().optional(),
  /** Ngày khách lên đơn + ngày vào sản xuất (hiển thị trên card + tooltip). */
  orderAt: z.date().optional(),
  inProductionAt: z.date().optional(),
  /** Thời điểm bản ghi được cập nhật lần cuối (Mongoose timestamps). */
  updatedAt: z.date().optional(),
  designerStatus: z.nativeEnum(DesignerStatus),
  designerAssignedAt: z.date().optional(),
  designerStartedAt: z.date().optional(),
  designerFirstStartedAt: z.date().optional(),
  designerCompletedAt: z.date().optional(),
  designerRejectedAt: z.date().optional(),
  designerReworkAt: z.date().optional(),
  designerRejectedReason: z.string().optional(),
  designerReworkCount: z.number().int().nonnegative(),
  designerWorkMs: z.number().int().nonnegative().default(0),
  productionError: z.string().optional(),
  productionErrorNote: z.string().optional(),
});
export type DesignerTaskCard = z.infer<typeof DesignerTaskCardZod>;

export const GetMyTasksZod = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  /** Faceted filters — CSV của workshop_config code (hoặc product type). */
  type: z.string().optional(),
  fabricType: z.string().optional(),
  machineNumber: z.string().optional(),
  toolResult: z.string().optional(),
  /** CSV workshop_config code (category tool_result_note) — lọc theo note kq Tool. */
  toolResultNote: z.string().optional(),
  /** CSV userSku — lọc theo khách hàng sở hữu đơn. */
  userSku: z.string().optional(),
  /**
   * CSV workshop_config code (category error_file_type) — lọc theo File sửa lỗi.
   * Field mảng trên order: khớp nếu đơn chứa BẤT KỲ mã nào đã chọn (`$in`).
   */
  errorFile: z.string().optional(),
  /** Free-text search (productionId/orderId). */
  search: z.string().optional(),
});
export class GetMyTasksDto extends createZodDto(extendApi(GetMyTasksZod)) {}

export const MyTasksColumnsZod = z.object({
  assigned: DesignerTaskCardZod.array(),
  inProgress: DesignerTaskCardZod.array(),
  rework: DesignerTaskCardZod.array(),
  done: DesignerTaskCardZod.array(),
});

export const GetMyTasksResZod = ResZod.extend({
  data: z.object({
    columns: MyTasksColumnsZod,
    rejected: DesignerTaskCardZod.array(),
    /** userId của user hiện tại (= ID, không phải display). */
    userId: z.string(),
    fullName: z.string().optional(),
  }),
});
export class GetMyTasksResDto extends createZodDto(extendApi(GetMyTasksResZod)) {}

export const DesignerMyStatsZod = z.object({
  assignedCount: z.number().int().nonnegative(),
  inProgressCount: z.number().int().nonnegative(),
  reworkCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  completedInPeriod: z.number().int().nonnegative(),
  avgResponseMin: z.number().nonnegative(),
  avgWorkMin: z.number().nonnegative(),
  errorRate: z.number().nonnegative(),
});
export type DesignerMyStats = z.infer<typeof DesignerMyStatsZod>;

export const GetMyStatsZod = z.object({
  period: z.enum(['today', '7d', '30d', 'custom']).default('today'),
  from: z.string().optional(),
  to: z.string().optional(),
});
export class GetMyStatsDto extends createZodDto(extendApi(GetMyStatsZod)) {}

export const GetMyStatsResZod = ResZod.extend({ data: DesignerMyStatsZod });
export class GetMyStatsResDto extends createZodDto(extendApi(GetMyStatsResZod)) {}

// ─── My daily breakdown (per-day status counts, current sub-designer) ─
// Bảng "Chi tiết theo ngày" trên /my-tasks: gom đơn CỦA CHÍNH USER theo ngày
// VÀO SẢN XUẤT (`inProductionAt`, tz VN) trong N ngày gần nhất (7/14/30) —
// focus vào đơn CHƯA XONG (assigned/rework/in-progress) để designer nhìn ra
// đơn tồn cũ chưa làm. `done` hiển thị kèm (muted) để đối chiếu khối lượng.

export const DesignerDailyBreakdownDayZod = z.object({
  /** Ngày vào sản xuất `YYYY-MM-DD` (VN). */
  day: z.string(),
  /** Số ngày tuổi tính tới hôm nay (>=0). Càng lớn = đơn càng cũ. */
  ageDays: z.number().int().nonnegative(),
  assigned: z.number().int().nonnegative(),
  rework: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  /** = assigned + rework + inProgress (đơn chưa làm xong trong ngày). */
  unfinished: z.number().int().nonnegative(),
});
export type DesignerDailyBreakdownDay = z.infer<typeof DesignerDailyBreakdownDayZod>;

export const GetMyDailyBreakdownZod = z.object({
  /** Cửa sổ ngày gần nhất — chỉ 7/14/30 (string trên query, coerce ở service). */
  days: z.enum(['7', '14', '30']).default('7'),
});
export class GetMyDailyBreakdownDto extends createZodDto(extendApi(GetMyDailyBreakdownZod)) {}

export const GetMyDailyBreakdownResZod = ResZod.extend({
  data: z.object({
    /** Chỉ các ngày CÓ đơn (>=1 status). Đã sort mới → cũ. */
    days: DesignerDailyBreakdownDayZod.array(),
    totals: z.object({
      assigned: z.number().int().nonnegative(),
      rework: z.number().int().nonnegative(),
      inProgress: z.number().int().nonnegative(),
      done: z.number().int().nonnegative(),
      unfinished: z.number().int().nonnegative(),
    }),
    /** Echo N (7/14/30). */
    rangeDays: z.number().int().positive(),
  }),
});
export class GetMyDailyBreakdownResDto extends createZodDto(extendApi(GetMyDailyBreakdownResZod)) {}

// ─── Bulk transition (Phase 4 extension) ────────────────────────────

export const DesignerBulkTransitionZod = z.object({
  ids: IDZod.array().min(1),
  action: z.nativeEnum(DesignerTransitionAction),
  /** Required khi action='reject'. */
  reason: z.string().max(500).optional(),
});
export class DesignerBulkTransitionDto extends createZodDto(
  extendApi(DesignerBulkTransitionZod),
) {}

export const DesignerBulkTransitionResZod = ResZod.extend({
  data: z.object({
    matched: z.number().int().nonnegative(),
    modified: z.number().int().nonnegative(),
    skipped: z
      .object({
        orderId: z.string(),
        productionId: z.string(),
        reason: z.string(),
      })
      .array(),
  }),
});
export class DesignerBulkTransitionResDto extends createZodDto(
  extendApi(DesignerBulkTransitionResZod),
) {}

// ─── My-task filter options (faceted) ───────────────────────────────

export const FilterOptionZod = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
});

export const GetMyTaskFiltersResZod = ResZod.extend({
  data: z.object({
    type: FilterOptionZod.array(),
    fabricType: FilterOptionZod.array(),
    machineNumber: FilterOptionZod.array(),
    toolResult: FilterOptionZod.array(),
    toolResultNote: FilterOptionZod.array(),
    userSku: FilterOptionZod.array(),
    errorFile: FilterOptionZod.array(),
  }),
});
export class GetMyTaskFiltersResDto extends createZodDto(
  extendApi(GetMyTaskFiltersResZod),
) {}

// ─── Designer breakdown (Admin / Leader on /orders page) ────────────

/** KPI counts theo designerStatus. */
export const DesignerStatusCountsZod = z.object({
  /** "Chưa gán không tool" — chưa gán & note≠'ok' & KHÔNG "Có tool" (name ^Có). */
  unassigned: z.number().int().nonnegative(),
  /** Tổng chưa gán = có-tool + không-tool (chưa gán & note≠'ok', cả 2 loại tool). */
  unassignedAll: z.number().int().nonnegative(),
  assigned: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  rework: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type DesignerStatusCounts = z.infer<typeof DesignerStatusCountsZod>;

/** 1 row per sub-designer + 1 row pseudo cho "Chưa gán". */
export const DesignerBreakdownRowZod = z.object({
  /** = user._id, hoặc `'__unassigned__'` cho row pseudo. */
  userId: z.string(),
  fullName: z.string(),
  email: z.string().optional(),
  counts: DesignerStatusCountsZod,
});
export type DesignerBreakdownRow = z.infer<typeof DesignerBreakdownRowZod>;

export const DesignerBreakdownResZod = ResZod.extend({
  data: z.object({
    /** KPI total theo FILTER hiện tại (narrow). */
    scoped: DesignerStatusCountsZod,
    /** KPI overall — KHÔNG áp filter, dùng làm tham chiếu. */
    overall: DesignerStatusCountsZod,
    /** Per-designer (filter-scoped). Đã sort theo total desc. */
    perDesigner: DesignerBreakdownRowZod.array(),
  }),
});
export class DesignerBreakdownResDto extends createZodDto(
  extendApi(DesignerBreakdownResZod),
) {}

// ─── Backlog tồn đọng theo Designer × Ngày (inProductionAt) ──────────
// Đơn CHƯA done (gồm unassigned + rejected) gom theo người ôm × ngày vào sản
// xuất. Dùng cho modal "Chi tiết tồn đọng" trên bảng Workshop.

/** Phân rã trạng thái tồn (KHÔNG có done). */
export const BacklogStatusCountsZod = z.object({
  unassigned: z.number().int().nonnegative(),
  assigned: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  rework: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
});
export type BacklogStatusCounts = z.infer<typeof BacklogStatusCountsZod>;

export const DesignerBacklogDayZod = z.object({
  /** Ngày vào sản xuất `YYYY-MM-DD` (VN), hoặc `'__nodate__'` khi thiếu `inProductionAt`. */
  day: z.string(),
  /** Số ngày tuổi tính tới hôm nay (>=0). `-1` khi `__nodate__`. */
  ageDays: z.number().int(),
  total: z.number().int().nonnegative(),
  byStatus: BacklogStatusCountsZod,
});
export type DesignerBacklogDay = z.infer<typeof DesignerBacklogDayZod>;

export const DesignerBacklogRowZod = z.object({
  /** = user._id, hoặc `'__unassigned__'`. */
  userId: z.string(),
  fullName: z.string(),
  total: z.number().int().nonnegative(),
  /** Ngày tồn cũ nhất (YYYY-MM-DD) hoặc null. */
  oldestDay: z.string().nullable(),
  /** Số ngày tuổi của đơn cũ nhất. */
  oldestAgeDays: z.number().int(),
  /** Đã sort ngày cũ → mới. */
  days: DesignerBacklogDayZod.array(),
});
export type DesignerBacklogRow = z.infer<typeof DesignerBacklogRowZod>;

export const DesignerBacklogResZod = ResZod.extend({
  data: z.object({
    total: z.number().int().nonnegative(),
    oldestDay: z.string().nullable(),
    /** Per-designer, sort theo total tồn desc (Chưa gán đẩy cuối). */
    designers: DesignerBacklogRowZod.array(),
  }),
});
export class DesignerBacklogResDto extends createZodDto(
  extendApi(DesignerBacklogResZod),
) {}

// ─── Stats dashboard (Phase 5) ──────────────────────────────────────

export const DesignerLeaderboardRowZod = z.object({
  /** = user._id. Key chính. */
  userId: z.string(),
  fullName: z.string(),
  email: z.string().optional(),
  /** Snapshot — đang ở các trạng thái này TẠI THỜI ĐIỂM hiện tại. */
  assignedCount: z.number().int().nonnegative(),
  inProgressCount: z.number().int().nonnegative(),
  reworkCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  completedInPeriod: z.number().int().nonnegative(),
  /** Cumulative — tổng số LẦN đã trả lại TRONG period (đếm event từ OrderLog,
   *  kể cả task đã được re-assign sau đó). */
  totalRejected: z.number().int().nonnegative(),
  /** Cumulative — tổng số LẦN đã chuyển về rework TRONG period (kể cả task
   *  đã restart xong). */
  totalRework: z.number().int().nonnegative(),
  avgResponseMin: z.number().nonnegative(),
  avgWorkMin: z.number().nonnegative(),
  errorRate: z.number().nonnegative(),
});
export type DesignerLeaderboardRow = z.infer<typeof DesignerLeaderboardRowZod>;

export const GetDesignerPerformanceZod = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  /** Optional — chỉ lấy 1 user. */
  userId: z.string().optional(),
});
export class GetDesignerPerformanceDto extends createZodDto(
  extendApi(GetDesignerPerformanceZod),
) {}

export const GetDesignerPerformanceResZod = ResZod.extend({
  data: DesignerLeaderboardRowZod.array(),
});
export class GetDesignerPerformanceResDto extends createZodDto(
  extendApi(GetDesignerPerformanceResZod),
) {}

export const DesignerTimelineBucketZod = z.object({
  date: z.string(),
  assigned: z.number().int().nonnegative(),
  started: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  rework: z.number().int().nonnegative(),
});
export type DesignerTimelineBucket = z.infer<typeof DesignerTimelineBucketZod>;

export const GetDesignerTimelineZod = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
export class GetDesignerTimelineDto extends createZodDto(extendApi(GetDesignerTimelineZod)) {}

export const GetDesignerTimelineResZod = ResZod.extend({
  data: DesignerTimelineBucketZod.array(),
});
export class GetDesignerTimelineResDto extends createZodDto(
  extendApi(GetDesignerTimelineResZod),
) {}

// ─── Production error stats (giữ — không liên quan assignee) ──────────

export const ErrorStatsCodeZod = z.object({
  code: z.string(),
  label: z.string().optional(),
  errorSource: z.enum(['designer', 'factory']).optional(),
  count: z.number().int().nonnegative(),
});
export type ErrorStatsCode = z.infer<typeof ErrorStatsCodeZod>;

export const ErrorStatsZod = z.object({
  bySource: z.object({
    designer: z.number().int().nonnegative(),
    factory: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  byCode: ErrorStatsCodeZod.array(),
  total: z.number().int().nonnegative(),
});
export type ErrorStats = z.infer<typeof ErrorStatsZod>;

export const GetErrorStatsZod = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
export class GetErrorStatsDto extends createZodDto(extendApi(GetErrorStatsZod)) {}

export const GetErrorStatsResZod = ResZod.extend({ data: ErrorStatsZod });
export class GetErrorStatsResDto extends createZodDto(extendApi(GetErrorStatsResZod)) {}
