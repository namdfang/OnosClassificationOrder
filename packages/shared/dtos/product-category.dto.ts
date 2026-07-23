import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

/**
 * Danh mục sản phẩm — module riêng (KHÔNG dùng workshop_config) để
 * ProductConfig + Promotion (scope='category') tham chiếu qua `_id`. Cùng
 * pattern với Factory/MachineType (`factory.dto.ts`).
 */
export const ProductCategoryZod = BaseEntityZod.extend({
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(20),
  isActive: z.boolean().default(true),
});
export type ProductCategory = z.infer<typeof ProductCategoryZod>;

//
export const GetProductCategoriesZod = PageQueryZod.extend({
  isActive: z.coerce.boolean().optional(),
});
export class GetProductCategoriesDto extends createZodDto(extendApi(GetProductCategoriesZod)) {}

export const GetProductCategoriesResZod = PageResZod.extend({ data: ProductCategoryZod.array() });
export class GetProductCategoriesResDto extends createZodDto(extendApi(GetProductCategoriesResZod)) {}

//
export const CreateProductCategoryZod = z.object({
  name: ProductCategoryZod.shape.name,
  shortName: ProductCategoryZod.shape.shortName,
  isActive: ProductCategoryZod.shape.isActive.optional(),
});
export class CreateProductCategoryDto extends createZodDto(extendApi(CreateProductCategoryZod)) {}

export const CreateProductCategoryResZod = ResZod.extend({ data: ProductCategoryZod });
export class CreateProductCategoryResDto extends createZodDto(extendApi(CreateProductCategoryResZod)) {}

//
export const UpdateProductCategoryZod = z.object({
  name: ProductCategoryZod.shape.name.optional(),
  shortName: ProductCategoryZod.shape.shortName.optional(),
  isActive: ProductCategoryZod.shape.isActive.optional(),
});
export class UpdateProductCategoryDto extends createZodDto(extendApi(UpdateProductCategoryZod)) {}

export const UpdateProductCategoryResZod = ResZod.extend({ data: ProductCategoryZod });
export class UpdateProductCategoryResDto extends createZodDto(extendApi(UpdateProductCategoryResZod)) {}
