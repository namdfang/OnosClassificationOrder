import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { ResZod } from '../types/Res';

/**
 * Bộ API nội bộ cho AI agent (`API-1`) — DTO dùng chung.
 *
 * Thiết kế đầy đủ: `.devtasks/design/API-1.md`. Nguyên tắc xuyên suốt là
 * **danh sách trắng ở tầng TRƯỜNG, cấm là mặc định**: bên gọi không bao giờ
 * đặt được tên trường đầu ra, nên không có đường đưa dữ liệu bị che ra ngoài
 * dưới một cái tên khác.
 *
 * FE **không** dùng file này — bên tiêu thụ là AI agent nội bộ. Đặt ở
 * `packages/shared` theo quy ước DTO của repo.
 */

// ─── Nang luc A — liet ke bang + doc tho ────────────────────────────────

export const AgentTableSummaryZod = z.object({
  key: z.string(),
  description: z.string(),
  fieldCount: z.number().int().nonnegative(),
  readableFields: z.string().array(),
});
export type AgentTableSummary = z.infer<typeof AgentTableSummaryZod>;

export const ListAgentTablesResZod = ResZod.extend({ data: AgentTableSummaryZod.array() });
export class ListAgentTablesResDto extends createZodDto(extendApi(ListAgentTablesResZod)) {}

export const ReadAgentTableQueryZod = z.object({
  limit: z.coerce.number().int().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  /** Tap con cua cac truong `read:true`; truong ngoai danh sach trang bi tu choi. */
  fields: z
    .union([z.string(), z.string().array()])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
});
export class ReadAgentTableQueryDto extends createZodDto(extendApi(ReadAgentTableQueryZod)) {}

export const AgentRowsPayloadZod = z.object({
  items: z.record(z.unknown()).array(),
  nextCursor: z.string().optional(),
  meta: z.object({
    table: z.string(),
    returned: z.number().int().nonnegative(),
    /** Tran lo thuc su duoc ap — ben goi truyen `limit` lon hon tran thi bi kep xuong day. */
    limitApplied: z.number().int().positive(),
  }),
});
export type AgentRowsPayload = z.infer<typeof AgentRowsPayloadZod>;

export const ReadAgentTableResZod = ResZod.extend({ data: AgentRowsPayloadZod });
export class ReadAgentTableResDto extends createZodDto(extendApi(ReadAgentTableResZod)) {}

// ─── Nang luc B — DSL truy van co kiem soat ─────────────────────────────

export const AGENT_FILTER_OPS = [
  'eq',
  'ne',
  'in',
  'nin',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'exists',
  'startsWith',
] as const;
export const AgentFilterOpZod = z.enum(AGENT_FILTER_OPS);
export type AgentFilterOp = z.infer<typeof AgentFilterOpZod>;

/** Chi nhan gia tri nguyen thuy — object/array long nhau la duong dua toan tu mongo vao. */
const AgentScalarZod = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const AgentConditionZod = z
  .object({
    field: z.string().min(1).max(120),
    op: AgentFilterOpZod,
    value: z.union([AgentScalarZod, AgentScalarZod.array().min(1).max(200)]).optional(),
  })
  .strict();
export type AgentCondition = z.infer<typeof AgentConditionZod>;

/**
 * Cay dieu kien. Sau toi da 5 muc — chan payload long sau co tinh de ton CPU
 * ngay o buoc kiem, truoc khi cham toi DB.
 */
export const AGENT_FILTER_MAX_DEPTH = 5;

export type AgentFilterNode =
  | AgentCondition
  | { and: AgentFilterNode[] }
  | { or: AgentFilterNode[] }
  | { not: AgentFilterNode };

export const AgentFilterNodeZod: z.ZodType<AgentFilterNode> = z.lazy(() =>
  z.union([
    AgentConditionZod,
    z.object({ and: AgentFilterNodeZod.array().min(1).max(20) }).strict(),
    z.object({ or: AgentFilterNodeZod.array().min(1).max(20) }).strict(),
    z.object({ not: AgentFilterNodeZod }).strict(),
  ]),
);

export const AgentSortZod = z
  .object({ field: z.string().min(1).max(120), dir: z.enum(['asc', 'desc']).default('asc') })
  .strict();
export type AgentSort = z.infer<typeof AgentSortZod>;

export const AgentSelectZod = z
  .object({
    kind: z.literal('rows').default('rows'),
    fields: z.string().array().max(80).optional(),
    sort: AgentSortZod.array().max(3).optional(),
    limit: z.number().int().min(1).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();
export type AgentSelect = z.infer<typeof AgentSelectZod>;

export const AGENT_METRIC_OPS = ['count', 'sum', 'avg', 'min', 'max'] as const;
export const AgentMetricOpZod = z.enum(AGENT_METRIC_OPS);
export type AgentMetricOp = z.infer<typeof AgentMetricOpZod>;

export const AgentMetricZod = z
  .object({
    op: AgentMetricOpZod,
    /** Bat buoc voi sum/avg/min/max; bo qua voi count. */
    field: z.string().min(1).max(120).optional(),
    as: z
      .string()
      .min(1)
      .max(40)
      // Ten cot ket qua do ben goi dat — chi cho chu/so/gach duoi de no khong bao gio
      // tro thanh mot duong dan truong hay mot toan tu mongo.
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Ten metric chi gom chu, so va dau gach duoi'),
  })
  .strict();
export type AgentMetric = z.infer<typeof AgentMetricZod>;

export const AgentAggregateZod = z
  .object({
    groupBy: z.string().array().max(4).optional(),
    metrics: AgentMetricZod.array().min(1).max(8),
    sort: AgentSortZod.array().max(3).optional(),
    limit: z.number().int().min(1).optional(),
  })
  .strict();
export type AgentAggregate = z.infer<typeof AgentAggregateZod>;

export const AgentQueryZod = z
  .object({
    table: z.string().min(1).max(60),
    filter: AgentFilterNodeZod.optional(),
    select: AgentSelectZod.optional(),
    aggregate: AgentAggregateZod.optional(),
  })
  .strict()
  .refine((q) => !(q.select && q.aggregate), {
    message: 'select va aggregate loai tru nhau — chon mot trong hai',
  });
export class AgentQueryDto extends createZodDto(extendApi(AgentQueryZod)) {}

export const AgentQueryPayloadZod = z.object({
  items: z.record(z.unknown()).array(),
  meta: z.object({
    table: z.string(),
    mode: z.enum(['rows', 'aggregate']),
    returned: z.number().int().nonnegative(),
    limitApplied: z.number().int().positive(),
  }),
});
export type AgentQueryPayload = z.infer<typeof AgentQueryPayloadZod>;

export const AgentQueryResZod = ResZod.extend({ data: AgentQueryPayloadZod });
export class AgentQueryResDto extends createZodDto(extendApi(AgentQueryResZod)) {}

// ─── Nang luc C — tai lieu nghiep vu ────────────────────────────────────

export const AGENT_DOC_SECTIONS = ['agent-guide', 'feature', 'architecture'] as const;
export const AgentDocSectionZod = z.enum(AGENT_DOC_SECTIONS);
export type AgentDocSection = z.infer<typeof AgentDocSectionZod>;

export const AgentDocSummaryZod = z.object({
  slug: z.string(),
  title: z.string(),
  section: AgentDocSectionZod,
  lines: z.number().int().nonnegative(),
  sizeKb: z.number().nonnegative(),
  summary: z.string(),
});
export type AgentDocSummary = z.infer<typeof AgentDocSummaryZod>;

export const ListAgentDocsResZod = ResZod.extend({ data: AgentDocSummaryZod.array() });
export class ListAgentDocsResDto extends createZodDto(extendApi(ListAgentDocsResZod)) {}

export const AgentDocZod = z.object({
  slug: z.string(),
  title: z.string(),
  section: AgentDocSectionZod,
  markdown: z.string(),
});
export type AgentDoc = z.infer<typeof AgentDocZod>;

export const GetAgentDocResZod = ResZod.extend({ data: AgentDocZod });
export class GetAgentDocResDto extends createZodDto(extendApi(GetAgentDocResZod)) {}

// ─── Ma loi — TESTER dung lam Expected Result ───────────────────────────

export const AGENT_ERROR_CODES = {
  unauthorized: 'UNAUTHORIZED',
  tableNotAllowed: 'TABLE_NOT_ALLOWED',
  fieldNotAllowed: 'FIELD_NOT_ALLOWED',
  writeNotSupported: 'WRITE_NOT_SUPPORTED',
  invalidQuery: 'INVALID_QUERY',
  queryTimeout: 'QUERY_TIMEOUT',
  docNotFound: 'DOC_NOT_FOUND',
  docsUnavailable: 'DOCS_UNAVAILABLE',
} as const;
export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[keyof typeof AGENT_ERROR_CODES];
