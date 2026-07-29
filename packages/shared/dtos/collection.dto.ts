import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

/**
 * Collection sản phẩm (bộ sưu tập catalog — VD "Summer 2026", "Best seller").
 * KHÁC ProductCategory (phân loại cấu trúc, đa cấp): collection là nhóm gán tay
 * phẳng, 1 sản phẩm thuộc NHIỀU collection (`ProductConfig.collectionIds`).
 * Cùng pattern module với `product-category.dto.ts`.
 */
export const CollectionZod = BaseEntityZod.extend({
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(30),
  /** Ảnh đại diện collection (URL). */
  image: z.string().max(1000).optional(),
  description: z.string().max(2000).optional(),
  /** Thứ tự hiển thị (nhỏ → lớn). */
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type Collection = z.infer<typeof CollectionZod>;

//
export const GetCollectionsZod = PageQueryZod.extend({
  isActive: z.coerce.boolean().optional(),
});
export class GetCollectionsDto extends createZodDto(extendApi(GetCollectionsZod)) {}

export const GetCollectionsResZod = PageResZod.extend({ data: CollectionZod.array() });
export class GetCollectionsResDto extends createZodDto(extendApi(GetCollectionsResZod)) {}

//
export const CreateCollectionZod = z.object({
  name: CollectionZod.shape.name,
  shortName: CollectionZod.shape.shortName,
  image: CollectionZod.shape.image,
  description: CollectionZod.shape.description,
  sortOrder: CollectionZod.shape.sortOrder.optional(),
  isActive: CollectionZod.shape.isActive.optional(),
});
export class CreateCollectionDto extends createZodDto(extendApi(CreateCollectionZod)) {}

export const CreateCollectionResZod = ResZod.extend({ data: CollectionZod });
export class CreateCollectionResDto extends createZodDto(extendApi(CreateCollectionResZod)) {}

//
export const UpdateCollectionZod = z.object({
  name: CollectionZod.shape.name.optional(),
  shortName: CollectionZod.shape.shortName.optional(),
  image: CollectionZod.shape.image,
  description: CollectionZod.shape.description,
  sortOrder: CollectionZod.shape.sortOrder.optional(),
  isActive: CollectionZod.shape.isActive.optional(),
});
export class UpdateCollectionDto extends createZodDto(extendApi(UpdateCollectionZod)) {}

export const UpdateCollectionResZod = ResZod.extend({ data: CollectionZod });
export class UpdateCollectionResDto extends createZodDto(extendApi(UpdateCollectionResZod)) {}
