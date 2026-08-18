import { IDZod, UserLogType } from '@shared/constants';
import { BaseEntityZod } from '@shared/types';
import { z } from 'zod';

import { getObjectValues } from '../utils/getObjectValues';

//
export const UserLogZod = BaseEntityZod.extend({
  actorId: IDZod,
  /**
   * AUTH-1 AC-06 — SuperAdmin THẬT khi thay đổi này phát sinh trong phiên mạo
   * danh. `actorId` vẫn là người bị mạo danh (danh tính hiệu lực), field này
   * mới cho biết ai thực sự ngồi gõ. Rỗng ở phiên thường.
   */
  impersonatorId: IDZod.optional(),
  userId: IDZod,
  field: z.string(),
  before: z.any().optional(),
  after: z.any().optional(),
  type: z.enum(getObjectValues(UserLogType)),
});
export type UserLog = z.infer<typeof UserLogZod>;
