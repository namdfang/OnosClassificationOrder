import { Module } from '@nestjs/common';

import { RedisCacheController } from './redis-cache.controller';
import { RedisCacheService } from './redis-cache.service';

@Module({
  imports: [],
  controllers: [RedisCacheController],
  exports: [RedisCacheService],
  providers: [RedisCacheService],
})
export class RedisCacheModule {}
