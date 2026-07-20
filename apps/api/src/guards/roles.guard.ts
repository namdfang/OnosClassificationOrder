import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import _ from 'lodash';
import { RoleType } from 'shared';

import { PathAccess } from '@/constants/force-change-password-path';
import { RedisCacheService } from '@/modules/redis-cache/redis-cache.service';

import type { UserDocument } from '../modules/user/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(forwardRef(() => RedisCacheService))
    private readonly redisCacheService: RedisCacheService,
    private jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.get<RoleType[]>('roles', context.getHandler());

    const request = context.switchToHttp().getRequest();
    const user = <UserDocument>request.user;

    if (_.isEmpty(roles)) {
      return true;
    }

    if (user.forcePassChange) {
      const urls: string = request.url.split('?')[0].replaceAll('api/v1/', '');

      if (!PathAccess.includes(urls)) {
        return context.switchToHttp().getResponse().status(405).send({ message: 'You need to change password' });
      }
    }

    if (request?.passAuth) {
      return true;
    }

    const accessToken = request.headers.authorization?.replace('Bearer ', '') as string;

    // Cast type-only: JWT do chính hệ thống phát hành luôn là object payload
    // có sessionId. Token hỏng → decode trả null → throw tại đây (giữ nguyên
    // hành vi cũ, AuthGuard phía trước đã chặn token invalid từ sớm).
    const userInfo = this.jwtService.decode(accessToken) as { sessionId?: string };

    const cachedKey = `token:${userInfo.sessionId}:${user._id}`;
    const cachedToken = await this.redisCacheService.getHash(cachedKey, 'accessToken');

    if (cachedToken !== accessToken) {
      return false;
    }

    if (user.role?.name === RoleType.SuperAdmin) {
      return true;
    }

    if (roles.includes(RoleType.Seller) && user.role?.name === RoleType.SellerManager) {
      return true;
    }

    if (!user.role) {
      return false;
    }

    return roles.includes(user.role.name);
  }
}
