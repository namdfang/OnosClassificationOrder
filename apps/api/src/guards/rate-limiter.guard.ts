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

    // Route public (`@Auth([], [], { public: true })`) → `PublicStrategy` set
    // `request.user = { [Symbol.for('isPublic')]: true }`, KHÔNG có token/_id
    // thật. Không skip ở đây thì mọi caller ẩn danh (design-review tool, cron
    // job...) dùng CHUNG 1 bucket khoá literal "undefined" (session lẫn user)
    // — dễ bị 429 dồn dập do lẫn traffic của nhau, dù mỗi caller riêng chưa
    // vượt hạn mức thật. Route public vốn cố tình "không định danh caller"
    // (xem comment ở `order.controller.ts` design-review) nên bỏ qua rate
    // limit theo session/user là đúng chủ đích thiết kế.
    if ((request.user as Record<PropertyKey, unknown>)?.[Symbol.for('isPublic')]) {
      return true;
    }

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
