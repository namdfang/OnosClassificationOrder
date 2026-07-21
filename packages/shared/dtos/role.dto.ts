import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { RoleType, Status } from '@shared/enums';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { DESCRIPTION_MAX_LENGTH, DESCRIPTION_MIN_LENGTH } from '../constants/common-length';
import { IDZod } from '../constants/common-zod';
import { getObjectValues } from '../utils/getObjectValues';

export const RoleZod = BaseEntityZod.extend({
  name: z.nativeEnum(RoleType),
  description: z.string().min(DESCRIPTION_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).optional(),
  permissionIds: z.array(IDZod).default([]),
  /** Phase 5: static permission codes from PERMISSION_CATALOG. */
  permissionCodes: z.array(z.string()).default([]),
  /** Phase 5: locked from delete/rename when true. */
  isSystem: z.boolean().default(false),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
});
export type Role = z.infer<typeof RoleZod>;

//
// Phase 5 — update role permission codes
//
export const UpdateRolePermissionsZod = z.object({
  codes: z.array(z.string()).default([]),
});
export class UpdateRolePermissionsDto extends createZodDto(extendApi(UpdateRolePermissionsZod)) {}

export const UpdateRolePermissionsResZod = ResZod.extend({ data: RoleZod });
export class UpdateRolePermissionsResDto extends createZodDto(extendApi(UpdateRolePermissionsResZod)) {}

//
export const GetRolesZod = PageQueryZod.extend({
  status: RoleZod.shape.status.optional(),
});
export class GetRolesDto extends createZodDto(extendApi(GetRolesZod)) {}
export const GetRolesResZod = PageResZod.extend({
  data: RoleZod.array(),
});
export class GetRolesResDto extends createZodDto(extendApi(GetRolesResZod)) {}

//
export const CreateRoleZod = z.object({
  name: RoleZod.shape.name,
  description: RoleZod.shape.description,
  permissionIds: RoleZod.shape.permissionIds,
  status: RoleZod.shape.status,
});
export class CreateRoleDto extends createZodDto(extendApi(CreateRoleZod)) {}
export const CreateRoleResZod = ResZod.extend({
  data: RoleZod,
});
export class CreateRoleResDto extends createZodDto(extendApi(CreateRoleResZod)) {}

//
export const UpdateRoleZod = z.object({
  // name: RoleZod.shape.name.optional(),
  description: RoleZod.shape.description.optional(),
  permissionIds: RoleZod.shape.permissionIds.optional(),
  status: RoleZod.shape.status.optional(),
});
export class UpdateRoleDto extends createZodDto(extendApi(UpdateRoleZod)) {}
export const UpdateRoleResZod = ResZod.extend({
  data: RoleZod,
});
export class UpdateRoleResDto extends createZodDto(extendApi(UpdateRoleResZod)) {}
