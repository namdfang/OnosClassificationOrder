import type { Provider } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { AwsS3Service, BackblazeService, TelegramService } from 'core';

import { RedisCacheService } from '@/modules/redis-cache/redis-cache.service';

import { ApiConfigService, RateLimiterService } from './services';
import { SharedController } from './shared.controller';

const providers: Provider[] = [
  ApiConfigService,
  {
    provide: BackblazeService,
    useFactory: (configService: ApiConfigService) =>
      new BackblazeService({
        accountId: configService.awsS3Config.accessKey,
        applicationKey: configService.awsS3Config.secretKey,
        bucketName: configService.awsS3Config.imagesBucketName.split('/')[0],
        apiUrl: configService.awsS3Config.endpoint,
      }),
    inject: [ApiConfigService],
  },
  {
    provide: TelegramService,
    useFactory: (configService: ApiConfigService) =>
      new TelegramService({
        botToken: configService.telegram.botToken,
      }),
    inject: [ApiConfigService],
  },
  {
    provide: AwsS3Service,
    useFactory: (configService: ApiConfigService) =>
      new AwsS3Service({
        endpoint: configService.awsS3Config.endpoint,
        bucketApiVersion: configService.awsS3Config.bucketApiVersion,
        bucketRegion: configService.awsS3Config.bucketRegion.split('/')[0],
        bucketName: configService.awsS3Config.imagesBucketName,
        accessKey: configService.awsS3Config.accessKey,
        secretKey: configService.awsS3Config.secretKey,
      }),
    inject: [ApiConfigService],
  },
  RedisCacheService,
  JwtService,
  RateLimiterService,
];

@Global()
@Module({
  providers,
  imports: [CqrsModule],
  exports: [...providers, CqrsModule],
  controllers: [SharedController],
})
export class SharedModule {}
