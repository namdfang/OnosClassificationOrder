import { z } from 'zod';
import { BaseEntityZod, NameZod, NotificationType, IDZod, PageQueryZod, PageResZod, ResZod } from '..';
import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';

export const NotificationZod = BaseEntityZod.extend({
  title: NameZod,
  contentId: z.string().optional(),
  description: z.string().optional(),
  type: z.nativeEnum(NotificationType),
  seen: z.boolean().default(false),
  userId: IDZod,
});

export type Notification = z.infer<typeof NotificationZod>;

export const GetNotificationsZod = PageQueryZod.extend({
  type: NotificationZod.shape.type.optional(),
});
export class GetNotificationsDto extends createZodDto(extendApi(GetNotificationsZod)) {}

export const GetNotificationsResZod = PageResZod.extend({
  data: NotificationZod.array(),
  unseen: z.number().optional(),
});
export class GetNotificationsResDto extends createZodDto(extendApi(GetNotificationsResZod)) {}

export const CreateNotificationZod = z.object({
  title: NotificationZod.shape.title,
  content: z.string().optional(),
  type: NotificationZod.shape.type,
  userId: NotificationZod.shape.userId,
  description: NotificationZod.shape.description.optional(),
});
export class CreateNotificationDto extends createZodDto(extendApi(CreateNotificationZod)) {}

export const CreateNotificationSystemZod = z.object({
  title: NotificationZod.shape.title,
  content: z.string(),
});

export class CreateNotificationSystemDto extends createZodDto(extendApi(CreateNotificationSystemZod)) {}

export type CreateNotificationSystem = z.infer<typeof CreateNotificationSystemZod>;

export const CreateNotificationResZod = ResZod.extend({
  data: NotificationZod,
});
export class CreateNotificationResDto extends createZodDto(extendApi(CreateNotificationResZod)) {}

export const GetNotificationResZod = ResZod.extend({
  data: NotificationZod,
});
export class GetNotificationResDto extends createZodDto(extendApi(GetNotificationResZod)) {}

export const UpdateNotificationResZod = ResZod.extend({
  data: NotificationZod,
});
export class UpdateNotificationResDto extends createZodDto(extendApi(UpdateNotificationResZod)) {}

export const UpdateNotificationZod = z.object({
  seen: NotificationZod.shape.seen,
});
export class UpdateNotificationDto extends createZodDto(extendApi(UpdateNotificationZod)) {}
