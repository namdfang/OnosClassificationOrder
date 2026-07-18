/* eslint-disable @typescript-eslint/no-explicit-any */

import { CACHE_MANAGER, CacheInterceptor } from '@nestjs/cache-manager';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisCache } from 'cache-manager-redis-yet';
import type { Observable } from 'rxjs';
import { map, of } from 'rxjs';

import { CACHE_RESPONSE } from '@/decorators/redis-option.decorator';

@Injectable()
export class HttpCacheInterceptor extends CacheInterceptor {
  private redisClient;

  constructor(
    @Inject(CACHE_MANAGER) private cache: RedisCache,
    readonly reflector: Reflector,
  ) {
    super(CACHE_MANAGER, reflector);
    this.redisClient = this.cache.store.client;
  }

  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest();
    const { httpAdapter } = this.httpAdapterHost;

    const isGetRequest = httpAdapter.getRequestMethod(request) === 'GET';

    if (!isGetRequest) {
      return undefined;
    }

    return httpAdapter.getRequestUrl(request); // Use URL as cache key
  }

  // Override the cache key method to use custom TTL
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const url = this.trackBy(context); // Get the cache key

    if (!url) {
      return next.handle(); // If no cache key, proceed as usual
    }

    const metadata = this.reflector.get<{ ttl: number; keyName: string }>(CACHE_RESPONSE, context.getHandler()) || {};
    // console.log('🚀 ~ HttpCacheInterceptor ~ intercept ~ metadata:', metadata);
    const ttl = metadata.ttl;
    const keyName = metadata.keyName;

    const cacheKey = keyName ? keyName + ':' + url : url;

    const cachedData = await this.cache.get(cacheKey);

    if (cachedData) {
      // console.log('🚀 ~ Cache hit:', cachedData);
      console.log('🚀 ~ Cache hit:');

      return of(cachedData);
    }

    console.log('🚀 ~ Cache miss');

    // Fetch data and cache it
    return next.handle().pipe(
      map(async (data) => {
        await this.setKey(cacheKey, JSON.stringify(data), ttl);

        return data;
      }),
    );
  }

  async setKey(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (typeof ttl === 'number' && Number.isInteger(ttl) && ttl > 0) {
        await this.redisClient.setEx(key, ttl, value);
      } else {
        await this.redisClient.set(key, value);
      }
    } catch (error: any) {
      console.error(`Error setting key in cache: ${error.message}`);

      throw error;
    }
  }
}
