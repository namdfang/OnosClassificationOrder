import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { ActionType } from '../enums/commons';
import { BaseEntityZod } from '../types/BaseEntity';
import { PageQueryZod } from '../types/PageQuery';
import { PageResZod } from '../types/PageRes';
import { getObjectValues } from '../utils/getObjectValues';

export const ActionZod = BaseEntityZod.extend({
  ip: z.string(),
  userAgent: z.string(),
  sessionId: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  active: z.boolean().optional(),
  type: z.enum(getObjectValues(ActionType)),
  userId: z.string(),
  /**
   * AUTH-1 — tài khoản BỊ mạo danh (`userId` là SuperAdmin đi mạo danh).
   * `targetType` phân biệt nguồn tài khoản: `users` hay `customers`.
   */
  targetUserId: z.string().optional(),
  targetType: z.enum(['user', 'customer']).optional(),
  /** Mốc kết thúc phiên mạo danh (AC-05). `active=false` là cờ, field này là thời điểm. */
  endedAt: z.coerce.date().optional(),
});
export type Action = z.infer<typeof ActionZod>;

export const GetActionsZod = PageQueryZod.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ip: ActionZod.shape.ip.optional(),
  email: z.string().optional(),
  type: z.enum(getObjectValues(ActionType)).optional(),
  sessionId: z.string().optional(),
});
export class GetActionsDto extends createZodDto(extendApi(GetActionsZod)) {}
export const GetActionsResZod = PageResZod.extend({
  data: ActionZod.array(),
});
export class GetActionsResDto extends createZodDto(extendApi(GetActionsResZod)) {}
