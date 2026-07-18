import { Injectable } from '@nestjs/common';

import { RedisCacheService } from '../redis-cache/redis-cache.service';
import { SystemConfigRepository } from './system-config.repository';

@Injectable()
export class SystemConfigService {
  private readonly CACHE_PREFIX = 'system_config:';

  constructor(
    private readonly systemConfigRepository: SystemConfigRepository,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  async get<T>(key: string, defaultValue: T | null = null): Promise<T | null> {
    const cacheKey = `${this.CACHE_PREFIX}${key}`;
    const cachedValue = await this.redisCacheService.getKey(cacheKey);

    if (cachedValue !== null && cachedValue !== undefined) {
      try {
        return JSON.parse(cachedValue) as T;
      } catch {
        return cachedValue as unknown as T;
      }
    }

    const config = await this.systemConfigRepository.findOne({ key });
    const value = config ? (config.value as T) : defaultValue;

    if (value !== null) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await this.redisCacheService.setKey(cacheKey, stringValue, 3600);
    }

    return value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- config blob lưu tùy ý theo key
  async set(key: string, value: any, description?: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${key}`;

    const config = await this.systemConfigRepository.findOne({ key });

    if (config) {
      await this.systemConfigRepository.findOneAndUpdate({ key }, { $set: { value, description } });
    } else {
      await this.systemConfigRepository.create({ key, value, description });
    }

    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await this.redisCacheService.setKey(cacheKey, stringValue, 3600);
  }
}
