import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { WorkshopConfigCategory } from '@shared/enums';
import { BaseEntityZod, PageResZod, ResZod } from '@shared/types';

const WorkshopConfigCategoryZod = z.nativeEnum(WorkshopConfigCategory);

const HexColorZod = z
  .string()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, 'color must be hex like #ff0000');

/**
 * Production-error có thêm flag `errorSource` (chỉ áp dụng cho category
 * `production_error`). `'designer'` → khi xưởng set error này, đơn auto chuyển
 * `designerStatus='rework'`; `'factory'` → chỉ ghi nhận stats, không trigger rework.
 */
export const ErrorSourceZod = z.enum(['designer', 'factory']);
export type ErrorSource = z.infer<typeof ErrorSourceZod>;

export const WorkshopConfigZod = BaseEntityZod.extend({
  category: WorkshopConfigCategoryZod,
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  color: HexColorZod.optional(),
  icon: z.string().max(60).optional(),
  order: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  /** Chỉ dùng khi category=production_error. */
  errorSource: ErrorSourceZod.optional(),
});
export type WorkshopConfig = z.infer<typeof WorkshopConfigZod>;

// LIST
export const GetWorkshopConfigsZod = z.object({
  category: WorkshopConfigCategoryZod.optional(),
  isActive: z.coerce.boolean().optional(),
});
export class GetWorkshopConfigsDto extends createZodDto(extendApi(GetWorkshopConfigsZod)) {}

export const GetWorkshopConfigsResZod = PageResZod.extend({ data: WorkshopConfigZod.array() });
export class GetWorkshopConfigsResDto extends createZodDto(extendApi(GetWorkshopConfigsResZod)) {}

// LIST ALL (map theo category)
export const GetAllWorkshopConfigsResZod = ResZod.extend({
  data: z.record(WorkshopConfigCategoryZod, WorkshopConfigZod.array()),
});
export class GetAllWorkshopConfigsResDto extends createZodDto(extendApi(GetAllWorkshopConfigsResZod)) {}

// CREATE
export const CreateWorkshopConfigZod = z.object({
  category: WorkshopConfigCategoryZod,
  code: WorkshopConfigZod.shape.code,
  name: WorkshopConfigZod.shape.name,
  color: HexColorZod.optional(),
  icon: z.string().max(60).optional(),
  order: WorkshopConfigZod.shape.order.optional(),
  isActive: WorkshopConfigZod.shape.isActive.optional(),
  errorSource: ErrorSourceZod.optional(),
});
export class CreateWorkshopConfigDto extends createZodDto(extendApi(CreateWorkshopConfigZod)) {}

export const CreateWorkshopConfigResZod = ResZod.extend({ data: WorkshopConfigZod });
export class CreateWorkshopConfigResDto extends createZodDto(extendApi(CreateWorkshopConfigResZod)) {}

// UPDATE
export const UpdateWorkshopConfigZod = z.object({
  code: WorkshopConfigZod.shape.code.optional(),
  name: WorkshopConfigZod.shape.name.optional(),
  color: HexColorZod.optional(),
  icon: z.string().max(60).optional(),
  order: WorkshopConfigZod.shape.order.optional(),
  isActive: WorkshopConfigZod.shape.isActive.optional(),
  errorSource: ErrorSourceZod.optional(),
});
export class UpdateWorkshopConfigDto extends createZodDto(extendApi(UpdateWorkshopConfigZod)) {}

export const UpdateWorkshopConfigResZod = ResZod.extend({ data: WorkshopConfigZod });
export class UpdateWorkshopConfigResDto extends createZodDto(extendApi(UpdateWorkshopConfigResZod)) {}

// REORDER
export const ReorderWorkshopConfigZod = z.object({
  category: WorkshopConfigCategoryZod,
  items: z
    .object({
      id: z.string().min(1),
      order: z.number().int().nonnegative(),
    })
    .array()
    .min(1),
});
export class ReorderWorkshopConfigDto extends createZodDto(extendApi(ReorderWorkshopConfigZod)) {}

export const ReorderWorkshopConfigResZod = ResZod;
export class ReorderWorkshopConfigResDto extends createZodDto(extendApi(ReorderWorkshopConfigResZod)) {}

// DELETE
export const DeleteWorkshopConfigResZod = ResZod;
export class DeleteWorkshopConfigResDto extends createZodDto(extendApi(DeleteWorkshopConfigResZod)) {}
