import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { ResZod } from '@shared/types';
import { z } from 'zod';

import { IDZod } from '..';

/**
 * Cấu hình **ưu tiên gán xưởng theo khách hàng** (cao hơn product config).
 *
 * - `enabled` **false** → import lấy xưởng theo product config như bình thường.
 * - `enabled` **true** → mỗi đơn, nếu cặp (userSku, userEmail) khớp một khách đã
 *   gán trong config → **ép `factoryId`** theo xưởng của khách, bỏ qua factory
 *   của product config. Khách KHÔNG được gán → vẫn rơi về product config.
 * - **Bất biến:** 1 khách chỉ thuộc 1 xưởng (validate BE lúc lưu + FE lúc chọn).
 *
 * Lưu blob JSON trong collection `system_configs` (key bên dưới, cache Redis 1h).
 */
export const CUSTOMER_ASSIGNMENT_CONFIG_KEY = 'customer_assignment_config';

export const CustomerFactoryAllocZod = z.object({
  factoryId: IDZod,
  customerIds: IDZod.array(),
});
export type CustomerFactoryAlloc = z.infer<typeof CustomerFactoryAllocZod>;

export const CustomerAssignmentConfigZod = z.object({
  enabled: z.boolean().default(false),
  factories: CustomerFactoryAllocZod.array(),
  updatedAt: z.string().optional(),
});
export type CustomerAssignmentConfig = z.infer<typeof CustomerAssignmentConfigZod>;

export class SaveCustomerAssignmentConfigDto extends createZodDto(extendApi(CustomerAssignmentConfigZod)) {}

export const GetCustomerAssignmentConfigResZod = ResZod.extend({
  data: CustomerAssignmentConfigZod,
});
export class GetCustomerAssignmentConfigResDto extends createZodDto(extendApi(GetCustomerAssignmentConfigResZod)) {}

export const SaveCustomerAssignmentConfigResZod = ResZod.extend({
  data: CustomerAssignmentConfigZod,
});
export class SaveCustomerAssignmentConfigResDto extends createZodDto(extendApi(SaveCustomerAssignmentConfigResZod)) {}
