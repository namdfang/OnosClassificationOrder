import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { Status, StoreType } from '@shared/enums';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { CodeZod, DESCRIPTION_MAX_LENGTH, DESCRIPTION_MIN_LENGTH, getObjectValues, IDZod, NameZod } from '..';

export const StoreZod = BaseEntityZod.extend({
  name: NameZod,
  code: CodeZod.toUpperCase(),
  description: z.string().min(DESCRIPTION_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).optional(),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
  type: z.enum(getObjectValues(StoreType)).default(StoreType.Manual),
  userId: IDZod,
});
export type Store = z.infer<typeof StoreZod>;

//
export const GetStoresZod = PageQueryZod.extend({
  email: z.string().optional(),
  status: StoreZod.shape.status.optional(),
});
export class GetStoresDto extends createZodDto(extendApi(GetStoresZod)) {}
export const GetStoresResZod = PageResZod.extend({
  data: StoreZod.array(),
});
export class GetStoresResDto extends createZodDto(extendApi(GetStoresResZod)) {}

//
export const GetStoreResZod = ResZod.extend({
  data: StoreZod,
});
export class GetStoreResDto extends createZodDto(extendApi(GetStoreResZod)) {}

//
export const CreateStoreZod = z.object({
  name: StoreZod.shape.name,
  description: StoreZod.shape.description,
  status: StoreZod.shape.status,
  type: StoreZod.shape.type,
});
export class CreateStoreDto extends createZodDto(extendApi(CreateStoreZod)) {}
export const CreateStoreResZod = ResZod.extend({
  data: StoreZod,
});
export class CreateStoreResDto extends createZodDto(extendApi(CreateStoreResZod)) {}

//
export const UpdateStoreZod = z.object({
  name: StoreZod.shape.name.optional(),
  description: StoreZod.shape.description.optional(),
  status: StoreZod.shape.status.optional(),
});
export class UpdateStoreDto extends createZodDto(extendApi(UpdateStoreZod)) {}
export const UpdateStoreResZod = ResZod.extend({
  data: StoreZod,
});
export class UpdateStoreResDto extends createZodDto(extendApi(UpdateStoreResZod)) {}
