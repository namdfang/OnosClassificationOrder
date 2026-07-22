import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { ResZod } from '@shared/types';
import { z } from 'zod';

import { IDZod } from '../constants/common-zod';

/**
 * Cấu hình auto-gán designer theo xưởng.
 *
 * - Mỗi xưởng (`factoryId`) có một danh sách designer + trọng số (`weight`).
 * - **Bất biến:** 1 designer chỉ thuộc 1 xưởng (validate ở BE lúc lưu + FE lúc chọn).
 * - Trọng số tự do (không cần cộng đủ 100); hệ thống tự quy tỉ lệ `weight/Σweight`.
 * - Dùng cho `OrderService.autoAssignAfterImport` — sau khi soát tool xong
 *   (`toolResultNote` có giá trị & != 'ok') thì tự gán đơn cho designer theo tỉ lệ.
 *
 * Lưu dưới dạng blob JSON trong collection `system_configs` (key bên dưới).
 */
export const DESIGNER_ASSIGNMENT_CONFIG_KEY = 'designer_assignment_config';

export const DesignerAllocEntryZod = z.object({
  designerId: IDZod,
  /** Trọng số nhận task (>= 0). Tỉ lệ thực = weight / tổng weight của xưởng. */
  weight: z.number().min(0),
});
export type DesignerAllocEntry = z.infer<typeof DesignerAllocEntryZod>;

export const DesignerFactoryAllocZod = z.object({
  factoryId: IDZod,
  designers: DesignerAllocEntryZod.array(),
});
export type DesignerFactoryAlloc = z.infer<typeof DesignerFactoryAllocZod>;

export const DesignerAssignmentConfigZod = z.object({
  factories: DesignerFactoryAllocZod.array(),
  updatedAt: z.string().optional(),
});
export type DesignerAssignmentConfig = z.infer<typeof DesignerAssignmentConfigZod>;

export class SaveDesignerAssignmentConfigDto extends createZodDto(extendApi(DesignerAssignmentConfigZod)) {}

export const GetDesignerAssignmentConfigResZod = ResZod.extend({
  data: DesignerAssignmentConfigZod,
});
export class GetDesignerAssignmentConfigResDto extends createZodDto(extendApi(GetDesignerAssignmentConfigResZod)) {}

export const SaveDesignerAssignmentConfigResZod = ResZod.extend({
  data: DesignerAssignmentConfigZod,
});
export class SaveDesignerAssignmentConfigResDto extends createZodDto(extendApi(SaveDesignerAssignmentConfigResZod)) {}
