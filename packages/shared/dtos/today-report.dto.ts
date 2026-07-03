import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { IDZod } from '@shared/constants';
import { ResZod } from '@shared/types';

/**
 * "Báo cáo hôm nay" — DTO dùng chung cho 3 nơi: Soát tool (dashboard),
 * Designer (task của tôi), Fulfillment (task fulfillment mỗi công đoạn).
 *
 * Phạm vi: CỐ ĐỊNH hôm nay (giờ VN). Mỗi endpoint tự tính counts + lists từ
 * timestamp có sẵn (không thêm field DB). Ô "errorsFound" optional (ẩn ở
 * Designer). Ô "backlog" có 2 số: hôm nay phát sinh chưa xong + tổng tồn.
 */

/** 1 dòng đơn trong list báo cáo — slim, đủ hiển thị card. */
export const TodayReportOrderZod = z.object({
  _id: IDZod,
  productionId: z.string(),
  orderId: z.string().optional(),
  type: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  mockupUrl: z.string().optional(),
  userSku: z.string().optional(),
  toolResultNote: z.string().optional(),
  /** Mốc thời gian gắn với ô đang xem (nhận / xong / sửa lại / lỗi). */
  at: z.date().optional(),
});
export type TodayReportOrder = z.infer<typeof TodayReportOrderZod>;

export const TodayReportCountsZod = z.object({
  /** Đã nhận hôm nay. */
  received: z.number().int().nonnegative(),
  /** Làm được (hoàn thành) hôm nay. */
  completed: z.number().int().nonnegative(),
  /** Đơn đã sửa lại (hoàn thành hôm nay mà từng bị rework). */
  reworkDone: z.number().int().nonnegative(),
  /** Tìm được lỗi hôm nay — ẩn (undefined) ở Designer. */
  errorsFound: z.number().int().nonnegative().optional(),
  /** Còn tồn: đơn nhận hôm nay mà chưa xong. */
  backlogToday: z.number().int().nonnegative(),
  /** Còn tồn: tổng tồn hiện tại (snapshot, không giới hạn hôm nay). */
  backlogTotal: z.number().int().nonnegative(),
});
export type TodayReportCounts = z.infer<typeof TodayReportCountsZod>;

export const TodayReportListsZod = z.object({
  received: TodayReportOrderZod.array(),
  completed: TodayReportOrderZod.array(),
  reworkDone: TodayReportOrderZod.array(),
  errorsFound: TodayReportOrderZod.array().optional(),
  /** List cho ô "Còn tồn" = tổng tồn hiện tại. */
  backlog: TodayReportOrderZod.array(),
});
export type TodayReportLists = z.infer<typeof TodayReportListsZod>;

export const TodayReportZod = z.object({
  /** Ngày báo cáo (YYYY-MM-DD, giờ VN). */
  day: z.string(),
  counts: TodayReportCountsZod,
  lists: TodayReportListsZod,
});
export type TodayReport = z.infer<typeof TodayReportZod>;

export const GetTodayReportResZod = ResZod.extend({ data: TodayReportZod });
export class GetTodayReportResDto extends createZodDto(extendApi(GetTodayReportResZod)) {}
