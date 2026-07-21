import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { FulfillmentStage, WorkshopConfigCategory } from '@shared/enums';
import { BaseEntityZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

const WorkshopConfigCategoryZod = z.nativeEnum(WorkshopConfigCategory);
const FulfillmentStageZod = z.nativeEnum(FulfillmentStage);

const HexColorZod = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, 'color must be hex like #ff0000');

/**
 * Production-error có thêm flag `errorSource` (chỉ áp dụng cho category
 * `production_error`). `'designer'` → khi xưởng set error này, đơn auto chuyển
 * `designerStatus='rework'`; `'factory'` → chỉ ghi nhận stats, không trigger rework.
 */
export const ErrorSourceZod = z.enum(['designer', 'factory', 'tool-check']);
export type ErrorSource = z.infer<typeof ErrorSourceZod>;

/**
 * Đích đẩy về khi quét QR lỗi (Stage Error Catalog — xem StageErrorCatalog.md):
 * `tool-check` → Support soát lại; `designer` → designer rework; FulfillmentStage
 * → rework-back stage đó + làm lại chuỗi. errorSource được BE tự suy từ đây
 * (tool-check→tool-check, designer→designer, stage→factory).
 */
export const StageErrorReworkTargetZod = z.union([z.enum(['tool-check', 'designer']), FulfillmentStageZod]);
export type StageErrorReworkTarget = z.infer<typeof StageErrorReworkTargetZod>;

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
  /** Chỉ dùng khi category=production_error: công đoạn SỞ HỮU lỗi (Stage Error Catalog). Rỗng = lỗi chung. */
  stage: FulfillmentStageZod.optional(),
  /** Chỉ dùng khi category=production_error + có `stage`: đích đẩy về khi quét QR lỗi. */
  reworkTarget: StageErrorReworkTargetZod.optional(),
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

// ─── Stage Error Catalog (danh mục lỗi theo công đoạn — quét QR) ─────────────
// Row vẫn nằm trong workshop_config category=production_error (để reuse validate
// + resolve tên lỗi toàn hệ thống), nhưng CRUD qua endpoint riêng cho công nhân
// Fulfillment tự quản lỗi CỦA CÔNG ĐOẠN MÌNH. Xem StageErrorCatalog.md.

// LIST (1 công đoạn — bao gồm cả isActive=false để toggle ẩn/hiện)
export const GetStageErrorsZod = z.object({ stage: FulfillmentStageZod });
export class GetStageErrorsDto extends createZodDto(extendApi(GetStageErrorsZod)) {}

export const GetStageErrorsResZod = ResZod.extend({ data: WorkshopConfigZod.array() });
export class GetStageErrorsResDto extends createZodDto(extendApi(GetStageErrorsResZod)) {}

// CREATE — code do BE tự sinh (`se-<stage>-<n>`); Fulfillment bị ép stage = của mình.
export const CreateStageErrorZod = z.object({
  name: WorkshopConfigZod.shape.name,
  reworkTarget: StageErrorReworkTargetZod,
  /** Admin/Manager truyền stage tùy ý; Fulfillment BE tự lấy từ profile (bỏ qua field này). */
  stage: FulfillmentStageZod.optional(),
});
export class CreateStageErrorDto extends createZodDto(extendApi(CreateStageErrorZod)) {}

export const CreateStageErrorResZod = ResZod.extend({ data: WorkshopConfigZod });
export class CreateStageErrorResDto extends createZodDto(extendApi(CreateStageErrorResZod)) {}

// UPDATE — lỗi đã thêm KHÔNG cho sửa tên/đích (tránh đổi nghĩa QR đã in/đã gán
// vào đơn); CHỈ cho ẩn/hiện (ẩn thay vì xóa để giữ thống kê cũ).
export const UpdateStageErrorZod = z.object({
  isActive: z.boolean(),
});
export class UpdateStageErrorDto extends createZodDto(extendApi(UpdateStageErrorZod)) {}

export const UpdateStageErrorResZod = ResZod.extend({ data: WorkshopConfigZod });
export class UpdateStageErrorResDto extends createZodDto(extendApi(UpdateStageErrorResZod)) {}
