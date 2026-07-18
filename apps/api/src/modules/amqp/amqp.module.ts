import type { RabbitMQConfig } from '@golevelup/nestjs-rabbitmq';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService, registerAs } from '@nestjs/config';

import { ApiConfigService } from '@/shared/services';

const configService = new ApiConfigService(new ConfigService());

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV}`,
    }),
    RabbitMQModule.forRootAsync(RabbitMQModule, {
      inject: [ApiConfigService],
      useFactory: () =>
        registerAs(
          'amqp',
          (): RabbitMQConfig => ({
            uri: configService.rabbitmq.uri,
            exchanges: [
              {
                name: process.env.RABBITMQ_MAIN_EXCHANGE!,
                type: 'direct',
              },
            ],
            connectionInitOptions: { wait: false },
            connectionManagerOptions: {
              heartbeatIntervalInSeconds: 15,
              reconnectTimeInSeconds: 30,
            },
          }),
        )(),
    }),
  ],
  exports: [RabbitMQModule],
})
export class AmqpModule {}
