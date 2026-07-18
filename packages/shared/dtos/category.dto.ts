import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { CodeZod, IDZod, NameZod } from '@shared/constants';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { ResImageZod } from './upload.dto';

export const CategoryZod = BaseEntityZod.extend({
  name: NameZod,
  code: CodeZod.trim().toUpperCase(),
  description: z.string().trim().optional(),
  imageId: IDZod.optional(),
  parentId: IDZod.optional(),
});
export type Category = z.infer<typeof CategoryZod>;

export const CategoryResZod = CategoryZod.extend({
  image: ResImageZod.optional(),
  parent: z.object({ _id: z.string(), name: z.string() }).optional(),
});
export type CategoryRes = z.infer<typeof CategoryResZod>;

//
export const CreateCategoryZod = z.object({
  name: CategoryZod.shape.name,
  code: CategoryZod.shape.code,
  description: CategoryZod.shape.description,
  parentId: CategoryZod.shape.parentId,
});
export class CreateCategoryDto extends createZodDto(extendApi(CreateCategoryZod)) {}
export const CreateCategoryResZod = ResZod.extend({
  data: CategoryZod,
});
export class CreateCategoryResDto extends createZodDto(extendApi(CreateCategoryResZod)) {}

//
export const GetCategoriesZod = PageQueryZod;
export class GetCategoriesDto extends createZodDto(extendApi(GetCategoriesZod)) {}
export const GetCategoriesResZod = PageResZod.extend({
  data: CategoryZod.array(),
});
export class GetCategoriesResDto extends createZodDto(extendApi(GetCategoriesResZod)) {}

//
export const UpdateCategoryZod = CreateCategoryZod.partial();
export class UpdateCategoryDto extends createZodDto(extendApi(UpdateCategoryZod)) {}
export const UpdateCategoryResZod = ResZod.extend({
  data: CategoryZod,
});
export class UpdateCategoryResDto extends createZodDto(extendApi(UpdateCategoryResZod)) {}

//
export const DeleteCategoryResZod = ResZod.extend({
  data: CategoryZod.nullable(),
});
export class DeleteCategoryResDto extends createZodDto(extendApi(DeleteCategoryResZod)) {}
