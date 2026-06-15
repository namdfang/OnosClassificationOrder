import { SetMetadata } from '@nestjs/common';

// Define the metadata key
export const CACHE_RESPONSE = 'CACHE_RESPONSE';

// Decorator to set TTL
export function RedisOption(ttl = 180, keyName?: string): MethodDecorator {
  const metadata = { ttl, keyName };

  return SetMetadata(CACHE_RESPONSE, metadata);
}
