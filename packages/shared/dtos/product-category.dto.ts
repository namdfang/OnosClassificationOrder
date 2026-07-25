import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { IDZod } from '../constants/common-zod';

/**
 * Danh mục sản phẩm — module riêng (KHÔNG dùng workshop_config) để
 * ProductConfig + Promotion (scope='category') tham chiếu qua `_id`. Cùng
 * pattern với Factory/MachineType (`factory.dto.ts`).
 *
 * **Đa cấp độ** — `parentId` tự tham chiếu (self-ref) cho phép xây cây danh
 * mục không giới hạn độ sâu (VD: Áo/Quần → Áo → Áo thun). `ProductConfig`
 * (§2.4 Products.md) có thể chọn danh mục ở BẤT KỲ cấp độ nào (không bắt
 * buộc phải là node lá) qua `productCategoryId`. Danh sách vẫn trả về FLAT
 * (không nest lồng nhau) — FE tự dựng cây/indent từ `parentId`.
 */
export const ProductCategoryZod = BaseEntityZod.extend({
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(20),
  isActive: z.boolean().default(true),
  /** ref ProductCategoryEntity (self) — undefined = danh mục gốc (root). */
  parentId: IDZod.optional(),
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
  parentId: ProductCategoryZod.shape.parentId,
});
export class CreateProductCategoryDto extends createZodDto(extendApi(CreateProductCategoryZod)) {}

export const CreateProductCategoryResZod = ResZod.extend({ data: ProductCategoryZod });
export class CreateProductCategoryResDto extends createZodDto(extendApi(CreateProductCategoryResZod)) {}

//
export const UpdateProductCategoryZod = z.object({
  name: ProductCategoryZod.shape.name.optional(),
  shortName: ProductCategoryZod.shape.shortName.optional(),
  isActive: ProductCategoryZod.shape.isActive.optional(),
  parentId: ProductCategoryZod.shape.parentId,
});
export class UpdateProductCategoryDto extends createZodDto(extendApi(UpdateProductCategoryZod)) {}

export const UpdateProductCategoryResZod = ResZod.extend({ data: ProductCategoryZod });
export class UpdateProductCategoryResDto extends createZodDto(extendApi(UpdateProductCategoryResZod)) {}
