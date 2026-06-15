import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { Status } from '@shared/enums';
import { DESCRIPTION_MAX_LENGTH, DESCRIPTION_MIN_LENGTH, getObjectValues } from '..';

export const CustomRoleZod = BaseEntityZod.extend({
  name: z.string(),
  description: z.string().min(DESCRIPTION_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).optional(),
  permissionIds: z.array(z.string()).default([]),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
});
export type CustomRole = z.infer<typeof CustomRoleZod>;

//
export const GetCustomRolesZod = PageQueryZod.extend({
  status: CustomRoleZod.shape.status.optional(),
});
export class GetCustomRolesDto extends createZodDto(extendApi(GetCustomRolesZod)) {}
export const GetCustomRolesResZod = PageResZod.extend({
  data: CustomRoleZod.array(),
});
export class GetCustomRolesResDto extends createZodDto(extendApi(GetCustomRolesResZod)) {}

//
export const CreateCustomRoleZod = z.object({
  name: CustomRoleZod.shape.name,
  description: CustomRoleZod.shape.description,
  permissionIds: CustomRoleZod.shape.permissionIds,
  status: CustomRoleZod.shape.status,
});
export class CreateCustomRoleDto extends createZodDto(extendApi(CreateCustomRoleZod)) {}
export const CreateCustomRoleResZod = ResZod.extend({
  data: CustomRoleZod,
});
export class CreateCustomRoleResDto extends createZodDto(extendApi(CreateCustomRoleResZod)) {}

//
export const UpdateCustomRoleZod = z.object({
  name: CustomRoleZod.shape.name.optional(),
  description: CustomRoleZod.shape.description.optional(),
  permissionIds: CustomRoleZod.shape.permissionIds.optional(),
  status: CustomRoleZod.shape.status.optional(),
});
export class UpdateCustomRoleDto extends createZodDto(extendApi(UpdateCustomRoleZod)) {}
export const UpdateCustomRoleResZod = ResZod.extend({
  data: CustomRoleZod,
});
export class UpdateCustomRoleResDto extends createZodDto(extendApi(UpdateCustomRoleResZod)) {}
