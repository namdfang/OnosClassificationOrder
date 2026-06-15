import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { Role } from 'shared';
import { getObjectValues, ID_LENGTH, RoleType, Status } from 'shared';

import type { PermissionDocument } from '../permission/permission.entity';

@DatabaseEntity({ collection: 'roles' })
export class RoleEntity extends DatabaseEntityAbstract {
  @Prop({
    type: String,
    enum: RoleType,
    required: true,
    unique: true,
  })
  name: RoleType;

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

  /** Phase 5: string codes from PERMISSION_CATALOG (shared). */
  @Prop({ type: [String], default: [] })
  permissionCodes: string[];

  /** Phase 5: system roles (Admin/Designer/...) cannot be deleted/renamed. */
  @Prop({ type: Boolean, default: false })
  isSystem: boolean;
}

assertSameType<Role, RoleEntity>();
assertSameType<RoleEntity, Role>();

export const RoleSchema = SchemaFactory.createForClass(RoleEntity);
RoleSchema.virtual('permissions', {
  ref: 'PermissionEntity',
  localField: 'permissionIds',
  foreignField: '_id',
});

export type RoleDocument = HydratedDocument<RoleEntity> & {
  permissions?: PermissionDocument[];
};
