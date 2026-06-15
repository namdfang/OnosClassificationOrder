/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { RedisCache } from 'cache-manager-redis-yet';
import { isEmpty } from 'lodash';

@Injectable()
export class RedisCacheService {
  private redisClient;

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cache: RedisCache,
  ) {
    this.redisClient = this.cache.store.client;
  }

  async getKey(key: string): Promise<string | null> {
    try {
      return await this.redisClient.get(key);
    } catch (error: any) {
      console.error(`Error getting key from cache: ${error.message}`);

      throw error;
    }
  }

  async setKey(key: string, value: string, ttl?: number): Promise<void> {
    try {
      // eslint-disable-next-line unicorn/prefer-ternary
      if (ttl) {
        await this.redisClient.setEx(key, ttl, value);
      } else {
        await this.redisClient.set(key, value);
      }
    } catch (error: any) {
      console.error(`Error setting key in cache: ${error.message}`);

      throw error;
    }
  }

  async setHash(key: string, field: string, value: any, ttl?: number): Promise<void> {
    try {
      await this.redisClient.hSet(
        key,
        field,
        typeof value === 'string' || typeof value === 'number' ? value : JSON.stringify(value),
      );

      if (ttl) {
        await this.redisClient.expire(key, ttl);
      }
    } catch (error: any) {
      console.error(`Error setting hash in cache: ${error.message}`);

      throw error;
    }
  }

  async getHash(key: string, field: string): Promise<Record<string, unknown> | string | null> {
    try {
      const value = await this.redisClient.hGet(key, field);

      try {
        return value ? JSON.parse(value) : null;
      } catch {
        return value || null;
      }
    } catch (error: any) {
      console.error(`Error getting hash from cache: ${error.message}`);

      throw error;
    }
  }

  async getHashAll<T = Record<string, unknown> | null>(key: string): Promise<T | null> {
    try {
      const items = await this.redisClient.hGetAll(key);

      if (isEmpty(items)) {
        return null;
      }

      const parsedItems: Record<string, unknown> = {};

      // eslint-disable-next-line @typescript-eslint/no-shadow
      for (const [key, value] of Object.entries(items)) {
        try {
          parsedItems[key] = JSON.parse(value);
        } catch {
          parsedItems[key] = value;
        }
      }

      return parsedItems as T;
    } catch (error: any) {
      console.error(`Error getting hash from cache: ${error.message}`);

      throw error;
    }
  }

  async setHashFields(key: string, data: Array<{ field: string; value: any }>, ttl?: number) {
    const promises = data
      .filter(({ value }) => value !== undefined && value !== null)
      .map(({ field, value }) => this.setHash(key, field, value, ttl));
    await Promise.all(promises);
  }

  async deleteHashField(key: string, field: string): Promise<void> {
    try {
      await this.redisClient.hDel(key, field);
    } catch (error: any) {
      console.error(`Error deleting hash field in cache: ${error.message}`);

      throw error;
    }
  }

  async deleteKey(key: string): Promise<void> {
    try {
      await this.redisClient.del(key);
    } catch (error: any) {
      console.error(`Error deleting key from cache: ${error.message}`);

      throw error;
    }
  }

  async findKeysByPrefix(prefix: string): Promise<string[]> {
    let cursorNumber = 0;
    const keys = [];

    do {
      // eslint-disable-next-line no-await-in-loop
      const result = await this.redisClient.scan(cursorNumber, { MATCH: `${prefix}*`, COUNT: 100 });
      cursorNumber = Number(result.cursor);
      keys.push(...result.keys);
    } while (cursorNumber !== 0);

    return keys;
  }

  async clearAllData(): Promise<void> {
    try {
      await this.redisClient.flushAll();
    } catch (error: any) {
      console.error(`Error clearing all data from cache: ${error.message}`);

      throw error;
    }
  }

  async pushToList(key: string, values: string | string[], ttl?: number): Promise<void> {
    try {
      // eslint-disable-next-line sonarjs/no-all-duplicated-branches
      await (Array.isArray(values) ? this.redisClient.rPush(key, values) : this.redisClient.rPush(key, values));

      if (ttl) {
        await this.redisClient.expire(key, ttl);
      }
    } catch (error: any) {
      console.error(`Error pushing to list in cache: ${error.message}`);

      throw error;
    }
  }

  async getList(key: string, start = 0, end = -1): Promise<string[]> {
    try {
      return await this.redisClient.lRange(key, start, end);
    } catch (error: any) {
      console.error(`Error getting list from cache: ${error.message}`);

      throw error;
    }
  }

  async getListLength(key: string): Promise<number> {
    try {
      return await this.redisClient.lLen(key);
    } catch (error: any) {
      console.error(`Error getting list length from cache: ${error.message}`);

      throw error;
    }
  }

  async removeFromList(key: string, value: string, count = 0): Promise<void> {
    try {
      await this.redisClient.lRem(key, count, value);
    } catch (error: any) {
      console.error(`Error removing from list in cache: ${error.message}`);

      throw error;
    }
  }

  /**
   * SET key value NX EX ttl — returns true if set (key was new), false if key already exists.
   * Used for nonce replay protection.
   */
  async setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redisClient.set(key, value, { NX: true, EX: ttlSeconds });

      return result === 'OK';
    } catch (error: any) {
      console.error(`Error setIfNotExists in cache: ${error.message}`);

      throw error;
    }
  }

  /**
   * Atomic INCR + optional EXPIRE on first hit. Used for rate limit counters.
   */
  async incrementWithExpire(key: string, ttlSeconds: number): Promise<number> {
    try {
      const value = await this.redisClient.incr(key);

      if (value === 1) {
        await this.redisClient.expire(key, ttlSeconds);
      }

      return value;
    } catch (error: any) {
      console.error(`Error incrementWithExpire in cache: ${error.message}`);

      throw error;
    }
  }
}
