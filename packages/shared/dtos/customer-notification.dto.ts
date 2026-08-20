import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { IDZod } from '../constants/common-zod';

/**
 * Thông báo cho khách hàng ở chuông Customer Portal. Hai nguồn dùng CHUNG một
 * collection + chung cơ chế đã-đọc (`notificationsReadAt`):
 *  - **Admin soạn tay** (`CustomerPortal.md §9`) — `title`/`body` là văn bản
 *    admin viết, `event` rỗng. `customerId=null` = broadcast mọi khách.
 *  - **Hệ thống tự sinh theo trạng thái đơn** (ORD-5) — `event` + `eventData`
 *    có giá trị, FE render theo NGÔN NGỮ khách đang chọn; `title`/`body` chỉ
 *    là bản tiếng Việt dự phòng (client cũ / lịch sử admin).
 */

/**
 * Sự kiện đơn khách sinh thông báo (ORD-5). Cùng bộ với webhook cho khách API
 * (ORD-4, `CUSTOMER_WEBHOOK_EVENTS`) trừ `order.item_cancelled` — noti báo mức
 * ĐƠN nên phải nói rõ item nào bị hủy, còn 4 sự kiện kia gộp ở mức đơn.
 */
export const CUSTOMER_NOTIFICATION_EVENTS = [
  'order.pushed',
  'order.production_completed',
  'order.held',
  'order.unheld',
  'order.item_cancelled',
] as const;
export type CustomerNotificationEvent = (typeof CUSTOMER_NOTIFICATION_EVENTS)[number];
export const CustomerNotificationEventZod = z.enum(CUSTOMER_NOTIFICATION_EVENTS);

/**
 * Nhóm lý do giữ đơn hiển thị cho khách. `waiting-design`/`waiting-address` là
 * việc KHÁCH làm được → nêu rõ cần bổ sung gì; mọi lý do nội bộ khác gộp thành
 * `other` → thông điệp chung, TUYỆT ĐỐI không phô nguyên văn ghi chú nội bộ.
 */
export const CUSTOMER_HOLD_KINDS = ['waiting-design', 'waiting-address', 'other'] as const;
export type CustomerHoldKind = (typeof CUSTOMER_HOLD_KINDS)[number];

/** Dữ liệu render thông báo hệ thống — chỉ thứ khách vốn đã thấy ở portal. */
export const CustomerNotificationEventDataZod = z.object({
  /** Mã hiển thị của ĐƠN (productionId item đầu — mirror `orderDisplayCode` ở FE). */
  orderCode: z.string().optional(),
  /** Mã item cụ thể — chỉ dùng ở `order.item_cancelled`. */
  productionId: z.string().optional(),
  /** Chỉ ở `order.held`. */
  holdKind: z.enum(CUSTOMER_HOLD_KINDS).optional(),
  /** Staging id để FE mở đúng đơn khi bấm vào thông báo. */
  stagingId: IDZod.optional(),
});
export type CustomerNotificationEventData = z.infer<typeof CustomerNotificationEventDataZod>;

export const CustomerNotificationZod = BaseEntityZod.extend({
  title: z.string(),
  body: z.string().optional(),
  /** null/undefined = broadcast tới mọi khách hàng. */
  customerId: IDZod.nullish(),
  /** Rỗng với thông báo admin soạn tay; có giá trị = thông báo hệ thống (ORD-5). */
  event: CustomerNotificationEventZod.optional(),
  eventData: CustomerNotificationEventDataZod.optional(),
  createdByUserId: IDZod.optional(),
  /** Snapshot tên người gửi lúc tạo — tránh phải populate UserEntity khi hiển thị lịch sử. */
  createdByName: z.string().optional(),
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
