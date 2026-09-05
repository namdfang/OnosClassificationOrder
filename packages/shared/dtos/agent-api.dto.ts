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

/**
 * Mo ta MOT truong cua mot bang — dinh nghia DUY NHAT, dung chung cho ca hai
 * be mat (`API-18`).
 *
 * Truoc `API-18`, be mat agent chi tra ve TEN truong con be mat quan tri tra
 * du sau thuoc tinh nay. Hai noi mo ta cung mot truong theo hai kieu khac nhau
 * la thu AC-03 cam, nen chung nay la mot dinh nghia va `AgentAdminFieldZod`
 * chi la ten goi cu tro toi day.
 */
export const AgentFieldMetaZod = z.object({
  name: z.string(),
  /**
   * `object` them o `API-17`: truong la KHOI du lieu, tra ra nguyen khoi chu
   * khong phai mot gia tri le.
   *
   * `any` them o `API-19`: CHUA BIET kieu — truong khong co mo ta trong tu dien.
   * Them gia tri moi vao union nay la thay doi CONG THEM: trang quan tri hien
   * nhan qua i18n co defaultValue nen gia tri chua co ban dich van hien ra duoc.
   */
  type: z.enum(['string', 'number', 'date', 'bool', 'objectId', 'enum', 'object', 'any']),
  /** Co xuat hien trong du lieu tra ve hay khong. */
  read: z.boolean(),
  /** `none` khong loc duoc · `eq` chi so bang · `full` moi toan tu. */
  filter: z.enum(['none', 'eq', 'full']),
  sortable: z.boolean(),
  groupable: z.boolean(),
  aggregatable: z.boolean().optional(),
  /** Van ban nguoi dung go tay. */
  freeText: z.boolean().optional(),
  note: z.string().optional(),
});
export type AgentFieldMeta = z.infer<typeof AgentFieldMetaZod>;

export const AgentTableSummaryZod = z.object({
  key: z.string(),
  description: z.string(),
  entityName: z.string(),
  defaultSort: z.string(),
  fieldCount: z.number().int().nonnegative(),
  /** Ten cac truong `read:true`. Suy duoc tu `fields`, giu lai vi da cong bo. */
  readableFields: z.string().array(),
  /** Chinh sach day du tung truong (`API-18`). */
  fields: AgentFieldMetaZod.array(),
  /**
   * TEN cac truong agent co y KHONG doc duoc. Chi TEN, khong bao gio la gia
   * tri: endpoint nay mo ta CAU TRUC, khong tra du lieu ban ghi (AC-02).
   */
  excludedFields: z.string().array(),
});
export type AgentTableSummary = z.infer<typeof AgentTableSummaryZod>;

export const ListAgentTablesResZod = ResZod.extend({ data: AgentTableSummaryZod.array() });
export class ListAgentTablesResDto extends createZodDto(extendApi(ListAgentTablesResZod)) {}

export const ReadAgentTableQueryZod = z.object({
  limit: z.coerce.number().int().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  /**
   * Cay dieu kien `AgentFilterNode` dang chuoi JSON (`API-6`) — GET khong co
   * than yeu cau nen DSL long phai di qua query string.
   *
   * Giu la CHUOI o day, khong `transform` sang object: JSON hong hay dieu kien
   * sai chinh sach phai bao bang ma loi cua module (`INVALID_QUERY` /
   * `FIELD_NOT_ALLOWED`), chu khong roi vao 422 cua tang validate — bang 8 ma
   * la hop dong voi agent.
   */
  filter: z.string().max(4000).optional(),
  /** Tap con cua cac truong `read:true`; truong ngoai danh sach trang bi tu choi. */
  /**
   * Nhận CẢ hai cách viết: `fields=a,b,c` và `fields=a&fields=b`.
   *
   * Bản trước chỉ bọc chuỗi vào mảng, nên `fields=a,b` thành MỘT tên trường
   * `"a,b"` — Mongo chiếu vào một trường không tồn tại và trả về **object rỗng**,
   * không báo lỗi. Bên tích hợp thấy "chọn cột không ăn thua" nên quay lại kéo
   * nguyên bản ghi 42 trường mỗi dòng (đo 05/09: 1,68 triệu dòng/ngày).
   */
  fields: z
    .union([z.string(), z.string().array()])
    .optional()
    .transform((v) =>
      v === undefined
        ? undefined
        : (Array.isArray(v) ? v : [v]).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean),
    ),
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
    /**
     * Dieu kien loc dang MongoDB (`API-8` thay han DSL cay cu).
     *
     * KHONG kiem hinh dang o day: bo kiem that nam o `mongo-filter.ts` phia BE,
     * noi co danh sach trang toan tu VA chinh sach truong. Zod chi biet hinh
     * dang, khong biet truong nao duoc loc o muc nao — de Zod tu choi truoc thi
     * ban goi nhan 422 cua tang validate thay vi ma loi cua module, ma bang 8 ma
     * loi la hop dong voi agent.
     */
    filter: z.unknown().optional(),
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

// ─── Be mat QUAN TRI (API-3) — KHONG phai be mat cua agent ──────────────

/**
 * Trang hướng dẫn Agent API trong `/adm` (`API-3`). Đây là bề mặt **thứ hai**,
 * admin-only: xác thực bằng JWT + vai + quyền, không bằng khoá agent.
 *
 * Khác toàn bộ phần trên của file này, các kiểu dưới đây **FE có dùng** —
 * `apps/web` import thẳng, nên đổi một trường ở đây là đổi hợp đồng với FE.
 *
 * Thiết kế: `.devtasks/design/API-3.md` §3.
 */
/** Ten goi cu, giu cho frontend khoi phai doi import. MOT dinh nghia (`API-18`). */
export const AgentAdminFieldZod = AgentFieldMetaZod;
export type AgentAdminField = AgentFieldMeta;

/**
 * Bang cho trang quan tri — DAN XUAT tu `AgentTableSummaryZod` (`API-18`), bo
 * hai khoa chi be mat agent can. Dan xuat chu khong khai lai: hai noi mo ta
 * cung mot truong theo hai kieu khac nhau la thu AC-03 cam, va cach chac chan
 * nhat de dieu do khong xay ra la khong co dinh nghia thu hai de lech.
 *
 * `excludedFields` chi la TEN truong (`API-3` AC-16) — nguoi van hanh can biet
 * agent im lang vi truong bi che chu khong phai vi hong.
 */
export const AgentAdminTableZod = AgentTableSummaryZod.omit({ fieldCount: true, readableFields: true });
export type AgentAdminTable = z.infer<typeof AgentAdminTableZod>;

export const AgentAdminLimitsZod = z.object({
  /** Con số ĐANG CHẶN THẬT, đọc từ hằng số dùng chung với `@Throttle` (`API-4`). */
  rateLimitPerMin: z.number().int().positive(),
  maxLimit: z.number().int().positive(),
  readTimeoutMs: z.number().int().positive(),
  queryTimeoutMs: z.number().int().positive(),
});
export type AgentAdminLimits = z.infer<typeof AgentAdminLimitsZod>;

export const AgentAdminOverviewZod = z.object({
  /** Đường TƯƠNG ĐỐI; FE ghép origin của nó để dựng lời gọi thật và dòng curl. */
  basePath: z.string(),
  authHeader: z.string(),
  /** Đã cấu hình khoá chưa — về ngay khi mở trang, KHÔNG kèm giá trị khoá. */
  keyConfigured: z.boolean(),
  /** Tên biến môi trường cần đặt, để trang khỏi phải đoán. */
  keyEnvName: z.string(),
  limits: AgentAdminLimitsZod,
  tables: AgentAdminTableZod.array(),
});
export type AgentAdminOverview = z.infer<typeof AgentAdminOverviewZod>;

export const GetAgentAdminOverviewResZod = ResZod.extend({ data: AgentAdminOverviewZod });
export class GetAgentAdminOverviewResDto extends createZodDto(extendApi(GetAgentAdminOverviewResZod)) {}

/** Giá trị khoá — chỉ lấy khi người xem CHỦ ĐỘNG bấm hiện (`API-3` §3.2). */
export const AgentAdminKeyZod = z.object({ key: z.string() });
export type AgentAdminKey = z.infer<typeof AgentAdminKeyZod>;

export const GetAgentAdminKeyResZod = ResZod.extend({ data: AgentAdminKeyZod });
export class GetAgentAdminKeyResDto extends createZodDto(extendApi(GetAgentAdminKeyResZod)) {}

/**
 * `AGENT-ZALO` — một lệnh gọi trả đủ cho agent hỗ trợ khách/chủ tịch.
 *
 * Gộp 4 nguồn vào 1 để agent không phải tự ghép bảng: tóm tắt nhóm Zalo + phân
 * loại nhóm + số liệu đơn SỐNG + sản phẩm khách hay đặt.
 *
 * Nguồn là `zalo_group_summaries` — bảng CHỈ chứa nhóm khách/vận hành, vì tóm
 * tắt bị xoá khi nhóm chuyển sang `internal`. Nhóm cá nhân nhân viên không bao
 * giờ lọt ra endpoint này.
 */
/** Quá bao nhiêu giờ thì coi bản tóm tắt là cũ. Máy chủ dùng để bật `tomTatTre`. */
export const AGENT_TOM_TAT_HAN_GIO = 24;

export const AgentSellerSupportQueryZod = z.object({
  /** Lọc theo mức độ: `gap` | `can-chu-y` | `binh-thuong`. */
  mucDo: z.string().optional(),
  /** Lọc theo một khách cụ thể. */
  userSku: z.string().optional(),
  /** Bỏ phần sản phẩm cho nhẹ, khi chỉ cần danh sách việc gấp. */
  kemSanPham: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type AgentSellerSupportQuery = z.infer<typeof AgentSellerSupportQueryZod>;

export interface AgentSellerSupportItem {
  groupGlobalId: string;
  title: string | null;
  kind: string | null;
  lastMessageAt: Date | null;
  customerId: string | null;
  userSku: string | null;
  tomTat: {
    mucDo: string | null;
    tieuDe: string | null;
    khachQuanTam: string | null;
    salePhanHoi: string | null;
    tonDong: string | null;
    nghiNgo: string[];
    checklist: unknown[];
    soTin: number;
    /** Mốc chốt của bản tóm tắt — agent phải xem trước khi tin số liệu trong đó. */
    tomTatLuc: Date | null;
    /**
     * Máy chủ TỰ tính: bản tóm tắt đã quá `AGENT_TOM_TAT_HAN_GIO` giờ.
     *
     * Có `tomTatLuc` rồi vẫn cần cờ này, vì việc so mốc là thứ client dễ quên
     * nhất — mà quên thì agent trả lời khách bằng dữ liệu cũ với giọng chắc
     * chắn. Đặt ở phía máy chủ thì mọi client đều được bảo vệ như nhau.
     * (Dev tích hợp đề xuất, đúng: họ đã dính đúng lỗi này ở hệ báo cáo của họ.)
     */
    tomTatTre: boolean;
    denMocTin: Date | null;
    /**
     * Có tin nhắn SAU `denMocTin` chưa vào bản tóm tắt (so với `lastMessageAt`
     * của nhóm). Agent nên nói "tóm tắt chưa gồm tin mới nhất" khi cờ này bật,
     * kể cả khi `tomTatTre` còn tắt — hai cờ đo hai thứ khác nhau.
     */
    coTinMoi: boolean;
  };
  /** Số liệu đơn đọc SỐNG lúc gọi, không phải ảnh chụp trong tóm tắt. */
  donHang: {
    tongDon: number;
    dangLam: number;
    dangLoi: number;
    dangGiu: number;
    tonLauNhatNgay: number | null;
  } | null;
  sanPhamHay: { sanPham: string; soDon: number }[];
}

export class GetAgentSellerSupportResDto {
  success!: boolean;
  data!: AgentSellerSupportItem[];
}
