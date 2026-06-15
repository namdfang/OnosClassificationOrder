import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { ProviderCode, ProviderType, Status } from '@shared/enums';
import { DESCRIPTION_MAX_LENGTH, DESCRIPTION_MIN_LENGTH, getObjectValues, NameZod } from '..';

export const ProviderZod = BaseEntityZod.extend({
  name: NameZod,
  code: z.enum(getObjectValues(ProviderCode)),
  address: z.string(),
  country: z.string(),
  description: z.string().min(DESCRIPTION_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).optional(),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
  type: z.enum(getObjectValues(ProviderType)),
});
export type Provider = z.infer<typeof ProviderZod>;

//
export const GetProvidersZod = PageQueryZod.extend({
  status: ProviderZod.shape.status.optional(),
});
export class GetProvidersDto extends createZodDto(extendApi(GetProvidersZod)) {}
export const GetProvidersResZod = PageResZod.extend({
  data: ProviderZod.array(),
});
export class GetProvidersResDto extends createZodDto(extendApi(GetProvidersResZod)) {}

//
export const CreateProviderZod = z.object({
  name: ProviderZod.shape.name,
  code: ProviderZod.shape.code,
  address: ProviderZod.shape.address,
  country: ProviderZod.shape.country,
  description: ProviderZod.shape.description,
  status: ProviderZod.shape.status,
  type: ProviderZod.shape.type,
});
export class CreateProviderDto extends createZodDto(extendApi(CreateProviderZod)) {}
export const CreateProviderResZod = ResZod.extend({
  data: ProviderZod,
});
export class CreateProviderResDto extends createZodDto(extendApi(CreateProviderResZod)) {}

//
export const UpdateProviderZod = z.object({
  name: ProviderZod.shape.name.optional(),
  description: ProviderZod.shape.description.optional(),
  address: ProviderZod.shape.address.optional(),
  country: ProviderZod.shape.country.optional(),
  status: ProviderZod.shape.status.optional(),
  type: ProviderZod.shape.type.optional(),
});
export class UpdateProviderDto extends createZodDto(extendApi(UpdateProviderZod)) {}
export const UpdateProviderResZod = ResZod.extend({
  data: ProviderZod,
});
export class UpdateProviderResDto extends createZodDto(extendApi(UpdateProviderResZod)) {}
