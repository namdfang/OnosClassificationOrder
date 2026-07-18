import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

export const FactoryZod = BaseEntityZod.extend({
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(20),
  isActive: z.boolean().default(true),
});
export type Factory = z.infer<typeof FactoryZod>;

//
export const GetFactoriesZod = PageQueryZod.extend({
  isActive: z.coerce.boolean().optional(),
});
export class GetFactoriesDto extends createZodDto(extendApi(GetFactoriesZod)) {}

export const GetFactoriesResZod = PageResZod.extend({ data: FactoryZod.array() });
export class GetFactoriesResDto extends createZodDto(extendApi(GetFactoriesResZod)) {}

//
export const CreateFactoryZod = z.object({
  name: FactoryZod.shape.name,
  shortName: FactoryZod.shape.shortName,
  isActive: FactoryZod.shape.isActive.optional(),
});
export class CreateFactoryDto extends createZodDto(extendApi(CreateFactoryZod)) {}

export const CreateFactoryResZod = ResZod.extend({ data: FactoryZod });
export class CreateFactoryResDto extends createZodDto(extendApi(CreateFactoryResZod)) {}

//
export const UpdateFactoryZod = z.object({
  name: FactoryZod.shape.name.optional(),
  shortName: FactoryZod.shape.shortName.optional(),
  isActive: FactoryZod.shape.isActive.optional(),
});
export class UpdateFactoryDto extends createZodDto(extendApi(UpdateFactoryZod)) {}

export const UpdateFactoryResZod = ResZod.extend({ data: FactoryZod });
export class UpdateFactoryResDto extends createZodDto(extendApi(UpdateFactoryResZod)) {}
