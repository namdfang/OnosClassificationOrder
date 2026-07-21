import { IDZod, UserLogType } from '@shared/constants';
import { BaseEntityZod } from '@shared/types';
import { z } from 'zod';

import { getObjectValues } from '../utils/getObjectValues';

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
