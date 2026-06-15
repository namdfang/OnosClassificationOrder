import { z } from 'zod';

import { BaseEntityZod } from '@shared/types';
import { IDZod, UserLogType } from '@shared/constants';
import { getObjectValues } from '..';

//
export const UserLogZod = BaseEntityZod.extend({
  actorId: IDZod,
  userId: IDZod,
  field: z.string(),
  before: z.any().optional(),
  after: z.any().optional(),
  type: z.enum(getObjectValues(UserLogType)),
});
export type UserLog = z.infer<typeof UserLogZod>;
