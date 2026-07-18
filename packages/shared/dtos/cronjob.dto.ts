import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { NameZod } from '@shared/constants';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { getObjectValues, Status } from '..';

export const CronjobZod = BaseEntityZod.extend({
  name: NameZod,
  code: NameZod.toUpperCase(),
  description: z.string().trim().optional(),
  duration: z.string().trim(),
  status: z.enum(getObjectValues(Status)).default(Status.Inactive),
});
export type Cronjob = z.infer<typeof CronjobZod>;

//
export const CreateCronjobZod = z.object({
  name: CronjobZod.shape.name,
  code: CronjobZod.shape.code,
  duration: CronjobZod.shape.duration,
  description: CronjobZod.shape.description.optional(),
});
export class CreateCronjobDto extends createZodDto(extendApi(CreateCronjobZod)) {}
export const CreateCronjobResZod = ResZod.extend({
  data: CronjobZod,
});
export class CreateCronjobResDto extends createZodDto(extendApi(CreateCronjobResZod)) {}

//
export const GetCronjobsZod = PageQueryZod;
export class GetCronjobsDto extends createZodDto(extendApi(GetCronjobsZod)) {}
export const GetCronjobsResZod = PageResZod.extend({
  data: CronjobZod.array(),
});
export class GetCronjobsResDto extends createZodDto(extendApi(GetCronjobsResZod)) {}

//
export const UpdateCronjobZod = z.object({
  name: CronjobZod.shape.name.optional(),
  duration: CronjobZod.shape.duration.optional(),
  description: CronjobZod.shape.description.optional(),
});
export class UpdateCronjobDto extends createZodDto(extendApi(UpdateCronjobZod)) {}
export const UpdateCronjobResZod = ResZod.extend({
  data: CronjobZod,
});
export class UpdateCronjobResDto extends createZodDto(extendApi(UpdateCronjobResZod)) {}

//
export const DeleteCronjobResZod = ResZod.extend({
  data: CronjobZod.nullable(),
});
export class DeleteCronjobResDto extends createZodDto(extendApi(DeleteCronjobResZod)) {}
