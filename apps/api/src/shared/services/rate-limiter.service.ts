// rate-limiter.service.ts
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { RedisCache } from 'cache-manager-redis-yet';
import type { RateLimiterRes } from 'rate-limiter-flexible';
import { RateLimiterRedis } from 'rate-limiter-flexible';

import { ApiConfigService } from './api-config.service';

@Injectable()
export class RateLimiterService {
  private readonly sessionLimiter: RateLimiterRedis;

  private readonly userLimiter: RateLimiterRedis;

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cache: RedisCache,
    private readonly configService: ApiConfigService,
  ) {
    this.sessionLimiter = new RateLimiterRedis({
      storeClient: this.cache.store.client,
      keyPrefix: 'limit:session',
      points: this.configService.rateLimiter.sessionMax,
      duration: this.configService.rateLimiter.sessionTtl,
    });

    this.userLimiter = new RateLimiterRedis({
      storeClient: this.cache.store.client,
      keyPrefix: 'limit:user',
      points: this.configService.rateLimiter.userMax,
      duration: this.configService.rateLimiter.userTtl,
    });
  }

  async consumeToken(token: string) {
    try {
      return await this.sessionLimiter.consume(token);
    } catch (error) {
      console.log('🚀 ~ RateLimiterService ~ consumeToken ~ error:', error);

      return error as RateLimiterRes;
    }
  }

  async consumeUserId(userId: string) {
    try {
      return await this.userLimiter.consume(userId);
    } catch (error) {
      console.log('🚀 ~ RateLimiterService ~ consumeUser ~ error:', error);

      return error as RateLimiterRes;
    }
  }
}
