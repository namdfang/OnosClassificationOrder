import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { CustomRole } from 'shared';
import { getObjectValues, ID_LENGTH, Status } from 'shared';

import type { PermissionDocument } from '../permission/permission.entity';

@DatabaseEntity({ collection: 'customRoles' })
export class CustomRoleEntity extends DatabaseEntityAbstract {
  @Prop({
    required: true,
    unique: true,
  })
  name: string;

  @Prop()
  description?: string;

  @Prop({
    type: [
      {
        type: String,
        length: ID_LENGTH,
        ref: 'PermissionEntity',
      },
    ],
    default: [],
  })
  permissionIds: string[];

  @Prop({
    type: String,
    enum: getObjectValues(Status),
    default: Status.Active,
  })
  status: Status;
}

assertSameType<CustomRole, CustomRoleEntity>();
assertSameType<CustomRoleEntity, CustomRole>();

export const CustomRoleSchema = SchemaFactory.createForClass(CustomRoleEntity);
CustomRoleSchema.virtual('permissions', {
  ref: 'PermissionEntity',
  localField: 'permissionIds',
  foreignField: 'permissionId',
});

export type CustomRoleDocument = HydratedDocument<CustomRoleEntity> & {
  permissions?: PermissionDocument[];
};
