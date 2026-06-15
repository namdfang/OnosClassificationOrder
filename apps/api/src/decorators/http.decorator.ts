import type { ExecutionContext } from '@nestjs/common';
import { applyDecorators, createParamDecorator, SetMetadata, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard, PublicRoute } from 'core';
import type { PermissionType, RoleType } from 'shared';

import { PermissionsGuard, RateLimiterGuard, RolesGuard } from '@/guards';
import { AuthUserInterceptor } from '@/interceptors';

export function Auth(
  roles: RoleType[] = [],
  permission: PermissionType[] = [],
  options?: Partial<{ public: boolean }>,
): MethodDecorator {
  const isPublicRoute = options?.public;

  return applyDecorators(
    SetMetadata('roles', roles),
    SetMetadata('permission', permission),
    UseGuards(AuthGuard({ public: isPublicRoute }), RateLimiterGuard, PermissionsGuard, RolesGuard), // RateLimiterGuard
    ApiBearerAuth(),
    UseInterceptors(AuthUserInterceptor),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
    PublicRoute(isPublicRoute),
  );
}

export function Perm(permission: PermissionType[] = []): MethodDecorator {
  return applyDecorators(SetMetadata('permission', permission), UseGuards(AuthGuard(), PermissionsGuard));
}

export const ClientIp = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();

  return (request.headers['x-forwarded-for'] || '').split(',')[0] || request.ip;
});

export const UserAgent = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();

  return request.headers['user-agent'];
});

export const AccessToken = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();

  return request.headers.authorization.replace('Bearer ', '');
});
