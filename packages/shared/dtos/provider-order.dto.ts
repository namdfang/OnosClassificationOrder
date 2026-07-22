import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { IDZod, NameZod } from '../constants/common-zod';
import { ProviderOrderStatus } from '../constants/order';
import { Status } from '../enums/commons';
import { BaseEntityZod } from '../types/BaseEntity';
import { PageQueryZod } from '../types/PageQuery';
import { PageResZod } from '../types/PageRes';
import { ResZod } from '../types/Res';
import { getObjectValues } from '../utils/getObjectValues';

export const ProviderOrderZod = BaseEntityZod.extend({
  orderId: IDZod,
  providerOrderId: NameZod,
  otherOrderId: z.string().optional(),
  orderStatus: z.enum(getObjectValues(ProviderOrderStatus)),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
  userId: IDZod,
  lastFetchedAt: z.coerce.date().optional(),
  meta: z.object({}).optional(),
});
export type ProviderOrder = z.infer<typeof ProviderOrderZod>;

export const GetProviderOrdersZod = PageQueryZod.extend({
  status: ProviderOrderZod.shape.status.optional(),
});
export class GetProviderOrdersDto extends createZodDto(extendApi(GetProviderOrdersZod)) {}

export const GetProviderOrdersResZod = PageResZod.extend({
  data: ProviderOrderZod.array(),
});
export class GetProviderOrdersResDto extends createZodDto(extendApi(GetProviderOrdersResZod)) {}

export const CreateProviderOrderZod = z.object({
  providerOrderId: ProviderOrderZod.shape.providerOrderId,
  otherOrderId: ProviderOrderZod.shape.otherOrderId,
  orderStatus: ProviderOrderZod.shape.orderStatus,
  status: ProviderOrderZod.shape.status,
});
export class CreateProviderOrderDto extends createZodDto(extendApi(CreateProviderOrderZod)) {}

export const CreateProviderOrderResZod = ResZod.extend({
  data: ProviderOrderZod,
});
export class CreateProviderOrderResDto extends createZodDto(extendApi(CreateProviderOrderResZod)) {}

export const UpdateProviderOrderZod = z.object({
  orderStatus: ProviderOrderZod.shape.orderStatus.optional(),
  status: ProviderOrderZod.shape.status,
});
export class UpdateProviderOrderDto extends createZodDto(extendApi(UpdateProviderOrderZod)) {}

export const UpdateProviderOrderResZod = ResZod.extend({
  data: ProviderOrderZod,
});
export class UpdateProviderOrderResDto extends createZodDto(extendApi(UpdateProviderOrderResZod)) {}

export const GetProviderOrderResZod = ResZod.extend({
  data: ProviderOrderZod,
});
export class GetProviderOrderResDto extends createZodDto(extendApi(GetProviderOrderResZod)) {}
