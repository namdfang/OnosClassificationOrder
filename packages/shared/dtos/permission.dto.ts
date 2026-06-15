import { z } from 'zod';

import { BaseEntityZod } from '@shared/types';
import { DESCRIPTION_MAX_LENGTH, DESCRIPTION_MIN_LENGTH, NameZod, PermissionAction } from '@shared/constants';
import { Status } from '@shared/enums';
import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { getObjectValues } from '..';

export const PermissionZod = BaseEntityZod.extend({
  permissionId: NameZod,
  description: z.string().min(DESCRIPTION_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).optional(),
  action: z.nativeEnum(PermissionAction).default(PermissionAction.View),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
});
export type Permission = z.infer<typeof PermissionZod>;

//
export const GetPermissionsZod = PageQueryZod.extend({
  status: PermissionZod.shape.status.optional(),
});
export class GetPermissionsDto extends createZodDto(extendApi(GetPermissionsZod)) {}
export const GetPermissionsResZod = PageResZod.extend({
  data: PermissionZod.array(),
});
export class GetPermissionsResDto extends createZodDto(extendApi(GetPermissionsResZod)) {}

//
export const CreatePermissionZod = z.object({
  permissionId: PermissionZod.shape.permissionId,
  description: PermissionZod.shape.description,
  action: PermissionZod.shape.action,
  status: PermissionZod.shape.status,
});
export class CreatePermissionDto extends createZodDto(extendApi(CreatePermissionZod)) {}
export const CreatePermissionResZod = ResZod.extend({
  data: PermissionZod,
});
export class CreatePermissionResDto extends createZodDto(extendApi(CreatePermissionResZod)) {}

//
export const UpdatePermissionZod = z.object({
  permissionId: PermissionZod.shape.permissionId.optional(),
  description: PermissionZod.shape.description.optional(),
  action: PermissionZod.shape.action.optional(),
  status: PermissionZod.shape.status.optional(),
});
export class UpdatePermissionDto extends createZodDto(extendApi(UpdatePermissionZod)) {}
export const UpdatePermissionResZod = ResZod.extend({
  data: PermissionZod,
});
export class UpdatePermissionResDto extends createZodDto(extendApi(UpdatePermissionResZod)) {}
