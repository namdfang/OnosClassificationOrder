import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import {
  BaseEntityZod,
  CodeZod,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  getObjectValues,
  NameZod,
  PageQueryZod,
  PageResZod,
  ResZod,
  Status,
} from '..';

export const DepartmentZod = BaseEntityZod.extend({
  name: NameZod,
  code: CodeZod.toUpperCase(),
  description: z.string().min(DESCRIPTION_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).optional(),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
});
export type Department = z.infer<typeof DepartmentZod>;

export const GetDepartmentsZod = PageQueryZod.extend({
  status: DepartmentZod.shape.status.optional(),
});
export class GetDepartmentsDto extends createZodDto(extendApi(GetDepartmentsZod)) {}

export const GetDepartmentsResZod = PageResZod.extend({
  data: DepartmentZod.array(),
});
export class GetDepartmentsResDto extends createZodDto(extendApi(GetDepartmentsResZod)) {}

export const CreateDepartmentZod = z.object({
  name: DepartmentZod.shape.name,
  description: DepartmentZod.shape.description,
  status: DepartmentZod.shape.status,
});
export class CreateDepartmentDto extends createZodDto(extendApi(CreateDepartmentZod)) {}

export const CreateDepartmentResZod = ResZod.extend({
  data: DepartmentZod,
});
export class CreateDepartmentResDto extends createZodDto(extendApi(CreateDepartmentResZod)) {}

export const UpdateDepartmentZod = z.object({
  name: DepartmentZod.shape.name.optional(),
  description: DepartmentZod.shape.description.optional(),
  status: DepartmentZod.shape.status.optional(),
});
export class UpdateDepartmentDto extends createZodDto(extendApi(UpdateDepartmentZod)) {}

export const UpdateDepartmentResZod = ResZod.extend({
  data: DepartmentZod,
});
export class UpdateDepartmentResDto extends createZodDto(extendApi(UpdateDepartmentResZod)) {}

export const GetDepartmentResZod = ResZod.extend({
  data: DepartmentZod,
});
export class GetDepartmentResDto extends createZodDto(extendApi(GetDepartmentResZod)) {}
