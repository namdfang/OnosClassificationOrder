import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { IDZod } from '../constants/common-zod';
import { ZaloGroupKind } from '../enums/zalo-group-kind';

/**
 * Mức độ cần chú ý của một nhóm — do mô hình chấm, người vận hành đọc để biết
 * nhóm nào phải xử lý trước.
 */
export const ZaloSummaryLevel = {
  BinhThuong: 'binh-thuong',
  CanChuY: 'can-chu-y',
  Gap: 'gap',
} as const;
export type ZaloSummaryLevel = (typeof ZaloSummaryLevel)[keyof typeof ZaloSummaryLevel];
export const ZALO_SUMMARY_LEVELS = Object.values(ZaloSummaryLevel);

/** Một việc cần làm, tách sẵn thành dòng để làm theo được ngay. */
export const ZaloSummaryTaskZod = z.object({
  /** Ổn định qua các lượt tóm tắt (uuid) — nền cho tick theo id thay vì theo chỉ số. Bản cũ không có. */
  id: z.string().optional(),
  viec: z.string().min(1).max(500),
  /** Người vận hành tự tick. Mô hình KHÔNG được tự đặt `true`. */
  xong: z.boolean().default(false),
  taoLuc: z.string().optional(),
  xongLuc: z.string().nullable().optional(),
});
export type ZaloSummaryTask = z.infer<typeof ZaloSummaryTaskZod>;

/**
 * Bản tóm tắt tình hình một nhóm Zalo.
 *
 * Mục tiêu là theo dõi CHẤT LƯỢNG XỬ LÝ, không phải lưu lại nội dung chat —
 * nên các ô đều là kết luận ngắn, không phải trích đoạn hội thoại.
 */
export const ZaloGroupSummaryZod = BaseEntityZod.extend({
  groupGlobalId: z.string().min(1).max(120),
  customerId: IDZod.optional(),
  userSku: z.string().max(200).optional(),
  title: z.string().max(300).optional(),
  /** Loại nhóm lúc tóm tắt — UI đổi nhãn ô cho nhóm vận hành. Bản cũ không có. */
  kind: z.nativeEnum(ZaloGroupKind).optional(),

  /** Một dòng để liếc bảng là hiểu, khỏi phải mở chi tiết. */
  tieuDe: z.string().max(200).optional(),
  khachQuanTam: z.string().max(2000).optional(),
  salePhanHoi: z.string().max(2000).optional(),
  tonDong: z.string().max(2000).optional(),

  /**
   * Việc cần làm ở dạng DANH SÁCH, không phải văn xuôi.
   *
   * thghub chạy thử trên 6 nhóm prod: ô "sale cần làm gì" ra 3–4 dòng văn xuôi,
   * đọc thì hiểu nhưng không làm theo được — người đọc phải tự tách thành việc.
   */
  checklist: ZaloSummaryTaskZod.array().default([]),

  /**
   * Việc đã tick XONG nhưng mô hình không tìm thấy bằng chứng trong hội thoại.
   * Không có ô này thì việc tick khống bị gộp mất — tệ hơn cả không có nút tick.
   */
  nghiNgo: z.string().array().default([]),

  mucDo: z.enum([ZaloSummaryLevel.BinhThuong, ZaloSummaryLevel.CanChuY, ZaloSummaryLevel.Gap])
    .default(ZaloSummaryLevel.BinhThuong),

  /** Mốc tin nhắn cuối đã được tóm tắt — biết bản tóm tắt còn mới không. */
  denMocTin: z.date().optional(),
  /** Số tin đã đọc ở lượt gần nhất. */
  soTin: z.number().default(0),
  /**
   * Lần gần nhất đọc lại TỪ ĐẦU. Tóm tắt cuốn chiếu có bệnh trôi dần (một kết
   * luận sai được chép lại mãi), nên định kỳ phải cắt đứt bằng một lượt đọc thẳng.
   */
  docDayDuLuc: z.date().optional(),
  model: z.string().max(80).optional(),
  tomTatLuc: z.date().optional(),
});
export type ZaloGroupSummary = z.infer<typeof ZaloGroupSummaryZod>;

//
export const GetZaloSummariesZod = PageQueryZod.extend({
  mucDo: z.enum([ZaloSummaryLevel.BinhThuong, ZaloSummaryLevel.CanChuY, ZaloSummaryLevel.Gap]).optional(),
  customerId: IDZod.optional(),
  /** `true` → chỉ nhóm còn việc chưa tick xong. */
  conViec: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
});
export class GetZaloSummariesDto extends createZodDto(extendApi(GetZaloSummariesZod)) {}

/**
 * Một hàng ở bảng theo dõi = bản tóm tắt + hai trường TÍNH LÚC GỌI từ nhóm:
 * `lastMessageAt` (mốc tin cuối engine đã đồng bộ) và `coTinMoi` (có tin sau
 * `denMocTin` chưa vào tóm tắt). Không lưu — lưu là lại có thêm một mốc lệch.
 * Chỉ tươi tới lần `sync-zalo-groups` gần nhất.
 */
export const ZaloGroupSummaryRowZod = ZaloGroupSummaryZod.extend({
  lastMessageAt: z.date().optional(),
  coTinMoi: z.boolean().optional(),
});
export type ZaloGroupSummaryRow = z.infer<typeof ZaloGroupSummaryRowZod>;

export const GetZaloSummariesResZod = PageResZod.extend({ data: ZaloGroupSummaryRowZod.array() });
export class GetZaloSummariesResDto extends createZodDto(extendApi(GetZaloSummariesResZod)) {}

//
/** Một tin nhắn thô do script đẩy sang — đã lọc ở nguồn, chỉ giữ phần cần đọc. */
export const ZaloMessageInputZod = z.object({
  nguoiGui: z.string().max(200).optional(),
  /** Khoá tra vai trò trong bảng định danh. Tin của chính tài khoản công ty không có. */
  zaloUid: z.string().max(64).optional(),
  /** Tin do chính tài khoản công ty (trợ lý AI) gửi — engine không gắn uid cho nó. */
  laTroLyAi: z.boolean().optional(),
  /** @deprecated Giữ để script cũ không vỡ; vai trò nay tra từ `zaloUid`. */
  phia: z.enum(['me', 'them']).optional(),
  noiDung: z.string().max(4000),
  luc: z.coerce.date().optional(),
});
export type ZaloMessageInput = z.infer<typeof ZaloMessageInputZod>;

export const SummarizeZaloGroupZod = z.object({
  groupGlobalId: z.string().min(1).max(120),
  // 400 = chặn cứng; script `summarize-zalo-groups.mjs` (MAX_TIN) đã tự lấy 400 tin MỚI NHẤT.
  messages: ZaloMessageInputZod.array().min(1).max(400),
  /** Buộc đọc lại từ đầu thay vì cuốn chiếu (cắt bệnh trôi dần). */
  docLaiTuDau: z.boolean().optional(),
});
export class SummarizeZaloGroupDto extends createZodDto(extendApi(SummarizeZaloGroupZod)) {}

export const SummarizeZaloGroupResZod = ResZod.extend({ data: ZaloGroupSummaryZod });
export class SummarizeZaloGroupResDto extends createZodDto(extendApi(SummarizeZaloGroupResZod)) {}

//
/** Một nhóm đang chờ tóm tắt + mốc tin cần lấy từ. */
export const ZaloSummaryQueueItemZod = z.object({
  groupGlobalId: z.string(),
  title: z.string().optional(),
  /** Chỉ lấy tin SAU mốc này. Rỗng = lấy từ đầu. */
  tuMoc: z.date().nullable().optional(),
  /** Đã tới hạn đọc lại từ đầu chưa. */
  docLaiTuDau: z.boolean(),
});
export type ZaloSummaryQueueItem = z.infer<typeof ZaloSummaryQueueItemZod>;

export const GetZaloSummaryQueueResZod = ResZod.extend({ data: ZaloSummaryQueueItemZod.array() });
export class GetZaloSummaryQueueResDto extends createZodDto(extendApi(GetZaloSummaryQueueResZod)) {}

//
export const ToggleZaloSummaryTaskZod = z.object({
  index: z.number().int().min(0),
  xong: z.boolean(),
});
export class ToggleZaloSummaryTaskDto extends createZodDto(extendApi(ToggleZaloSummaryTaskZod)) {}
