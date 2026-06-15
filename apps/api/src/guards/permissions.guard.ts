import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RoleService } from '../modules/role/role.service';
import type { UserDocument } from '../modules/user/user.entity';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roleService: RoleService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.get<string>('permission', context.getHandler());

    if (!permission || permission.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = <UserDocument>request.user;

    const isPassPermissionGuard = user.customRole?.permissionIds.includes(permission.toString());

    if (isPassPermissionGuard) {
      request.passAuth = true;
      return true;
    }

    request.passAuth = false;

    // Endpoint requires a specific permission. User doesn't have it via customRole.
    // Delegate to RolesGuard for standard role-based authorization.
    return true;
  }
}
