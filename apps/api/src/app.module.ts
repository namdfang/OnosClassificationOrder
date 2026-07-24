import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { redisStore } from 'cache-manager-redis-yet';
import { AcceptLanguageResolver, HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n';
import path from 'path';
import { format, transports } from 'winston';
import rotateFile from 'winston-daily-rotate-file';

import { AuthModule } from '@/modules/auth/auth.module';
import { CounterModule } from '@/modules/counter/counter.module';
import { CronjobModule } from '@/modules/cronjob/cronjob.module';
import { CustomRoleModule } from '@/modules/custom-role/custom-role.module';
import { PermissionModule } from '@/modules/permission/permission.module';
import { RoleModule } from '@/modules/role/role.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { UserModule } from '@/modules/user/user.module';
import { WinstonModule } from '@/modules/winston/winston.module';

import { FastifyThrottlerGuard } from './guards/fastify-throttler.guard';
import { ActionModule } from './modules/actions/action.module';
import { AmqpModule } from './modules/amqp/amqp.module';
import { CollectionModule } from './modules/collection/collection.module';
import { CustomerModule } from './modules/customer/customer.module';
import { CustomerAssignmentModule } from './modules/customer-assignment/customer-assignment.module';
import { CustomerPortalModule } from './modules/customer-portal/customer-portal.module';
import { DepartmentModule } from './modules/departments/department.module';
import { DesignerModule } from './modules/designer/designer.module';
import { DesignerAssignmentModule } from './modules/designer-assignment/designer-assignment.module';
import { FactoryModule } from './modules/factory/factory.module';
import { FulfillmentModule } from './modules/fulfillment/fulfillment.module';
import { MachineTypeModule } from './modules/machine-type/machine-type.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { OrderModule } from './modules/order/order.module';
import { OrderLogModule } from './modules/order-log/order-log.module';
import { ProductCategoryModule } from './modules/product-category/product-category.module';
import { ProductConfigModule } from './modules/product-config/product-config.module';
import { PromotionModule } from './modules/promotion/promotion.module';
import { BullMQModule } from './modules/queue/bullmq.module';
import { RedisCacheModule } from './modules/redis-cache/redis-cache.module';
import { RedisCacheService } from './modules/redis-cache/redis-cache.service';
import { ScheduledReportsModule } from './modules/scheduled-reports/scheduled-reports.module';
import { TelegramNotificationModule } from './modules/telegram-notification/telegram-notification.module';
import { UploadModule } from './modules/upload/upload.module';
import { WorkshopConfigModule } from './modules/workshop-config/workshop-config.module';
import { ApiConfigService } from './shared/services';
import { RateLimiterService } from './shared/services/rate-limiter.service';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    AuthModule,
    UserModule,
    CounterModule,
    CronjobModule,
    RoleModule,
    CustomRoleModule,
    PermissionModule,
    UploadModule,
    DepartmentModule,
    FactoryModule,
    MachineTypeModule,
    ProductCategoryModule,
    ProductConfigModule,
    CollectionModule,
    PromotionModule,
    WorkshopConfigModule,
    OrderModule,
    OrderLogModule,
    DesignerModule,
    DesignerAssignmentModule,
    CustomerModule,
    CustomerAssignmentModule,
    CustomerPortalModule,
    FulfillmentModule,
    TelegramNotificationModule,
    ScheduledReportsModule,
    NotificationModule,
    ActionModule,
    MailModule,
    BullMQModule,
    SystemConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 300,
      },
    ]),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ApiConfigService],
      useFactory: (configService: ApiConfigService) => ({
        store: redisStore,
        password: configService.redis.password,
        database: configService.redis.db,
        socket: {
          host: configService.redis.host,
          port: configService.redis.port,
        },
      }),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV}`,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ApiConfigService],
      useFactory: (configService: ApiConfigService) => ({
        uri: configService.mongodbURI,
      }),
    }),
    I18nModule.forRootAsync({
      useFactory: (configService: ApiConfigService) => ({
        fallbackLanguage: configService.fallbackLanguage,
        loaderOptions: {
          path: path.join(__dirname, 'i18n'),
          watch: configService.isDevelopment,
        },
      }),
      resolvers: [{ use: QueryResolver, options: ['lang'] }, AcceptLanguageResolver, new HeaderResolver(['x-lang'])],
      imports: [SharedModule],
      inject: [ApiConfigService],
    }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ApiConfigService],
      useFactory: (apiConfigService: ApiConfigService) =>
        apiConfigService.isDevelopment
          ? {
              level: 'info',
              format: format.json(),
              defaultMeta: { '@timestamp': new Date() },
              transports: [
                new transports.File({
                  filename: 'logs/activity.log',
                  level: 'error',
                }),
                new transports.Console({
                  format: format.simple(),
                }),
                new rotateFile({
                  filename: 'logs/application-%DATE%.log',
                  datePattern: 'YYYY-MM-DD',
                  zippedArchive: true,
                  maxSize: '20m',
                  maxFiles: '14d',
                }),
              ],
            }
          : {
              level: 'activity',
              format: format.json(),
              defaultMeta: { service: 'user-service' },
              transports: [
                new transports.File({
                  filename: 'logs/activity.log',
                  level: 'error',
                }),
                new transports.Console({
                  format: format.simple(),
                }),
                new rotateFile({
                  filename: 'logs/application-%DATE%.log',
                  datePattern: 'YYYY-MM-DD',
                  zippedArchive: true,
                  maxSize: '20m',
                  maxFiles: '14d',
                }),
              ],
            },
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: path.resolve('./src/assets'),
      exclude: ['/api/(.*)'],
      serveStaticOptions: {
        setHeaders: (res, filepath) => {
          if (filepath.endsWith('doc.html')) {
            res.setHeader('Content-Security-Policy', '');
          }
        },
      },
    }),
    AmqpModule,
    RedisCacheModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ApiConfigService],
      useFactory: (configService: ApiConfigService) => ({
        connection: {
          password: configService.redis.password,
          db: Number(configService.redis.db),
          host: configService.redis.host,
          port: Number(configService.redis.port),
        },
      }),
    }),
  ],
  providers: [
    RedisCacheService,
    RateLimiterService,
    {
      provide: APP_GUARD,
      useClass: FastifyThrottlerGuard,
    },
  ],
})
export class AppModule {}
