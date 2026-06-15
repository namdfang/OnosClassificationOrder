import { applyDecorators, UseInterceptors } from '@nestjs/common';

import { RedisOption } from '@/decorators/redis-option.decorator'; // Đảm bảo rằng bạn đã định nghĩa RedisOption decorator
import { HttpCacheInterceptor } from '@/interceptors/http-cache.interceptor';

export function CacheRes(ttl?: number, keyName?: string): MethodDecorator {
  return applyDecorators(UseInterceptors(HttpCacheInterceptor), RedisOption(ttl, keyName));
}
