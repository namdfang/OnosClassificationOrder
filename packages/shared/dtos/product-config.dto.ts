import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { IDZod } from '..';

export const ProductConfigZod = BaseEntityZod.extend({
  fullName: z.string().min(1).max(300),
  shortName: z.string().min(1).max(60),
  computerType: z.string().max(60).optional(),
  machineTypeId: IDZod,
  factoryId: IDZod,
  /** workshop_config code (category=fabric_type). Default fabric used at import. */
  fabricType: z.string().max(60).optional(),
});
export type ProductConfig = z.infer<typeof ProductConfigZod>;

//
export const GetProductConfigsZod = PageQueryZod.extend({
  factoryId: IDZod.optional(),
  machineTypeId: IDZod.optional(),
});
export class GetProductConfigsDto extends createZodDto(extendApi(GetProductConfigsZod)) {}

export const GetProductConfigsResZod = PageResZod.extend({ data: ProductConfigZod.array() });
export class GetProductConfigsResDto extends createZodDto(extendApi(GetProductConfigsResZod)) {}

//
export const CreateProductConfigZod = z.object({
  fullName: ProductConfigZod.shape.fullName,
  shortName: ProductConfigZod.shape.shortName,
  computerType: ProductConfigZod.shape.computerType,
  machineTypeId: ProductConfigZod.shape.machineTypeId,
  factoryId: ProductConfigZod.shape.factoryId,
  fabricType: ProductConfigZod.shape.fabricType,
});
export class CreateProductConfigDto extends createZodDto(extendApi(CreateProductConfigZod)) {}

export const CreateProductConfigResZod = ResZod.extend({ data: ProductConfigZod });
export class CreateProductConfigResDto extends createZodDto(extendApi(CreateProductConfigResZod)) {}

//
export const UpdateProductConfigZod = z.object({
  fullName: ProductConfigZod.shape.fullName.optional(),
  shortName: ProductConfigZod.shape.shortName.optional(),
  computerType: ProductConfigZod.shape.computerType,
  machineTypeId: ProductConfigZod.shape.machineTypeId.optional(),
  factoryId: ProductConfigZod.shape.factoryId.optional(),
  fabricType: ProductConfigZod.shape.fabricType,
});
export class UpdateProductConfigDto extends createZodDto(extendApi(UpdateProductConfigZod)) {}

export const UpdateProductConfigResZod = ResZod.extend({ data: ProductConfigZod });
export class UpdateProductConfigResDto extends createZodDto(extendApi(UpdateProductConfigResZod)) {}

//
export const ImportProductConfigRowZod = z.object({
  fullName: z.string().min(1),
  shortName: z.string().min(1),
  computerType: z.string().optional(),
  machineCode: z.string().min(1),
  factoryCode: z.string().min(1),
});
export type ImportProductConfigRow = z.infer<typeof ImportProductConfigRowZod>;

export const ImportProductConfigZod = z.object({
  rows: ImportProductConfigRowZod.array().min(1),
});
export class ImportProductConfigDto extends createZodDto(extendApi(ImportProductConfigZod)) {}

export const ImportProductConfigResZod = ResZod.extend({
  data: z.object({
    imported: z.number(),
    updated: z.number(),
    skipped: z.array(z.object({ row: z.number(), reason: z.string() })),
  }),
});
export class ImportProductConfigResDto extends createZodDto(extendApi(ImportProductConfigResZod)) {}
