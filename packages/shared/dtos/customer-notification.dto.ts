import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { IDZod } from '../constants/common-zod';

/**
 * Thông báo Admin/nội bộ gửi cho khách hàng — chủ động soạn (KHÔNG tự sinh
 * theo trạng thái đơn). `customerId=null` = broadcast tới TẤT CẢ khách hàng.
 * Xem `CustomerPortal.md §9`.
 */
export const CustomerNotificationZod = BaseEntityZod.extend({
  title: z.string(),
  body: z.string().optional(),
  /** null/undefined = broadcast tới mọi khách hàng. */
  customerId: IDZod.nullish(),
  createdByUserId: IDZod,
  /** Snapshot tên người gửi lúc tạo — tránh phải populate UserEntity khi hiển thị lịch sử. */
  createdByName: z.string(),
  /** Chỉ có khi trả cho ADMIN xem lịch sử — tên/email khách nhận (rỗng nếu broadcast). */
  customerLabel: z.string().optional(),
});
export type CustomerNotification = z.infer<typeof CustomerNotificationZod>;

export const SendCustomerNotificationZod = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  /** Bỏ trống = broadcast tới TẤT CẢ khách hàng. */
  customerId: IDZod.optional(),
});
export class SendCustomerNotificationDto extends createZodDto(extendApi(SendCustomerNotificationZod)) {}

export const SendCustomerNotificationResZod = ResZod.extend({ data: CustomerNotificationZod });
export class SendCustomerNotificationResDto extends createZodDto(extendApi(SendCustomerNotificationResZod)) {}

export const GetSentCustomerNotificationsZod = PageQueryZod;
export class GetSentCustomerNotificationsDto extends createZodDto(extendApi(GetSentCustomerNotificationsZod)) {}

export const GetSentCustomerNotificationsResZod = PageResZod.extend({
  data: CustomerNotificationZod.array(),
});
export class GetSentCustomerNotificationsResDto extends createZodDto(extendApi(GetSentCustomerNotificationsResZod)) {}

export const GetCustomerNotificationsZod = PageQueryZod;
export class GetCustomerNotificationsDto extends createZodDto(extendApi(GetCustomerNotificationsZod)) {}

export const GetCustomerNotificationsResZod = PageResZod.extend({
  data: CustomerNotificationZod.array(),
  unreadCount: z.number(),
});
export class GetCustomerNotificationsResDto extends createZodDto(extendApi(GetCustomerNotificationsResZod)) {}

export class MarkCustomerNotificationsReadResDto extends createZodDto(extendApi(ResZod)) {}
