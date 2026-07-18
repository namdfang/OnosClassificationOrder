import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { ActionType, BaseEntityZod, getObjectValues, PageQueryZod, PageResZod } from '..';

export const ActionZod = BaseEntityZod.extend({
  ip: z.string(),
  userAgent: z.string(),
  sessionId: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  active: z.boolean().optional(),
  type: z.enum(getObjectValues(ActionType)),
  userId: z.string(),
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
