import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { FactoryFlowType } from '@shared/enums';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { BooleanFlagZod } from '../constants/common-zod';

export const FactoryZod = BaseEntityZod.extend({
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(20),
  isActive: z.boolean().default(true),
  /** Luồng fulfillment: 'standard' 6 công đoạn | 'merged' rút gọn (xưởng gỗ — Ép/May ra tự xong). */
  flowType: z.nativeEnum(FactoryFlowType).default(FactoryFlowType.Standard),
});
export type Factory = z.infer<typeof FactoryZod>;

//
export const GetFactoriesZod = PageQueryZod.extend({
  /**
   * `true` → chỉ xưởng đang bật; `false` → chỉ xưởng đã tắt. Cờ BA TRẠNG THÁI
   * (service kiểm `typeof === 'boolean'`) — ORD-28.
   *
   * `BooleanFlagZod` chứ KHÔNG phải `z.coerce.boolean()` — cái sau coi mọi chuỗi
   * khác rỗng là bật, kể cả `'false'`. Xem `Orders.md §23`.
   */
  isActive: BooleanFlagZod,
});
export class GetFactoriesDto extends createZodDto(extendApi(GetFactoriesZod)) {}

export const GetFactoriesResZod = PageResZod.extend({ data: FactoryZod.array() });
export class GetFactoriesResDto extends createZodDto(extendApi(GetFactoriesResZod)) {}

//
export const CreateFactoryZod = z.object({
  name: FactoryZod.shape.name,
  shortName: FactoryZod.shape.shortName,
  isActive: FactoryZod.shape.isActive.optional(),
  flowType: z.nativeEnum(FactoryFlowType).optional(),
});
export class CreateFactoryDto extends createZodDto(extendApi(CreateFactoryZod)) {}

export const CreateFactoryResZod = ResZod.extend({ data: FactoryZod });
export class CreateFactoryResDto extends createZodDto(extendApi(CreateFactoryResZod)) {}

//
export const UpdateFactoryZod = z.object({
  name: FactoryZod.shape.name.optional(),
  shortName: FactoryZod.shape.shortName.optional(),
  isActive: FactoryZod.shape.isActive.optional(),
  flowType: z.nativeEnum(FactoryFlowType).optional(),
});
export class UpdateFactoryDto extends createZodDto(extendApi(UpdateFactoryZod)) {}

export const UpdateFactoryResZod = ResZod.extend({ data: FactoryZod });
export class UpdateFactoryResDto extends createZodDto(extendApi(UpdateFactoryResZod)) {}
