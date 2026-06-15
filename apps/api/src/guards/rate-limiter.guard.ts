// rate-limiter.guard.ts
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { RateLimitException } from 'core';
import type { FastifyReply } from 'fastify';

import type { UserDocument } from '@/modules/user/user.entity';

import { RateLimiterService } from '../shared/services/rate-limiter.service';

@Injectable()
export class RateLimiterGuard implements CanActivate {
  constructor(private readonly rateLimiterService: RateLimiterService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const response = context.switchToHttp().getResponse() as FastifyReply;

    const token: string = request.headers.authorization?.split(' ')[1];
    const userId: string = request.user._id as string;

    if ((request.user as UserDocument).rateLimitBypass) {
      return true;
    }

    const tokenResult = await this.rateLimiterService.consumeToken(token);
    // console.log('🚀 ~ RateLimiterGuard ~ canActivate ~ tokenResult:', tokenResult);

    if (tokenResult.remainingPoints <= 0) {
      void response.header('X-RateLimit-Base', 'session');
      void response.header('X-RateLimit-Limit', tokenResult.remainingPoints + tokenResult.consumedPoints);
      void response.header('X-RateLimit-Remaining', tokenResult.remainingPoints);
      void response.header('X-RateLimit-Reset', Math.floor(tokenResult.msBeforeNext / 1000));

      throw new RateLimitException('session');
    } else {
      const userResult = await this.rateLimiterService.consumeUserId(userId);
      // console.log('🚀 ~ RateLimiterGuard ~ canActivate ~ userResult:', userResult);

      if (userResult.remainingPoints <= 0) {
        void response.header('X-RateLimit-Base', 'user');
        void response.header('X-RateLimit-Limit', userResult.remainingPoints + userResult.consumedPoints);
        void response.header('X-RateLimit-Remaining', userResult.remainingPoints);
        void response.header('X-RateLimit-Reset', Math.floor(userResult.msBeforeNext / 1000));

        throw new RateLimitException('user');
      }

      void response.header('X-RateLimit-Base', 'session');
      void response.header('X-RateLimit-Limit', tokenResult.remainingPoints + tokenResult.consumedPoints);
      void response.header('X-RateLimit-Remaining', tokenResult.remainingPoints);
      void response.header('X-RateLimit-Reset', Math.floor(tokenResult.msBeforeNext / 1000));
    }

    return true;
  }
}
