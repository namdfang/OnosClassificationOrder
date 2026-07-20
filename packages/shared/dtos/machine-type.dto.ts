import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

export const MachineTypeZod = BaseEntityZod.extend({
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(20),
  isActive: z.boolean().default(true),
});
export type MachineType = z.infer<typeof MachineTypeZod>;

//
export const GetMachineTypesZod = PageQueryZod.extend({
  isActive: z.coerce.boolean().optional(),
});
export class GetMachineTypesDto extends createZodDto(extendApi(GetMachineTypesZod)) {}

export const GetMachineTypesResZod = PageResZod.extend({ data: MachineTypeZod.array() });
export class GetMachineTypesResDto extends createZodDto(extendApi(GetMachineTypesResZod)) {}

//
export const CreateMachineTypeZod = z.object({
  name: MachineTypeZod.shape.name,
  shortName: MachineTypeZod.shape.shortName,
  isActive: MachineTypeZod.shape.isActive.optional(),
});
export class CreateMachineTypeDto extends createZodDto(extendApi(CreateMachineTypeZod)) {}

export const CreateMachineTypeResZod = ResZod.extend({ data: MachineTypeZod });
export class CreateMachineTypeResDto extends createZodDto(extendApi(CreateMachineTypeResZod)) {}

//
export const UpdateMachineTypeZod = z.object({
  name: MachineTypeZod.shape.name.optional(),
  shortName: MachineTypeZod.shape.shortName.optional(),
  isActive: MachineTypeZod.shape.isActive.optional(),
});
export class UpdateMachineTypeDto extends createZodDto(extendApi(UpdateMachineTypeZod)) {}

export const UpdateMachineTypeResZod = ResZod.extend({ data: MachineTypeZod });
export class UpdateMachineTypeResDto extends createZodDto(extendApi(UpdateMachineTypeResZod)) {}
