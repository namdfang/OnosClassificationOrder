import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MailerModule } from '@nestjs-modules/mailer';

import { ApiConfigService } from '../../shared/services';
import { MailConsumer } from './mail.consumer';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { MailHistoryEntity, MailHistorySchema } from './mail-history.entity';
import { MailHistoryRepository } from './mail-history.repository';
import { MailTemplateEntity, MailTemplateSchema } from './mail-template.entity';
import { MailTemplateRepository } from './mail-template.repository';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ApiConfigService],
      useFactory: (apiConfigService: ApiConfigService) => ({
        transport: {
          host: apiConfigService.smtp.host,
          port: Number(apiConfigService.smtp.port),
          secure: false,
          auth: {
            user: apiConfigService.smtp.username,
            pass: apiConfigService.smtp.password,
          },
          requireTLS: true,
          tls: {
            ciphers: 'SSLv3',
            rejectUnauthorized: false,
          },
        },
        defaults: {
          from: 'no-reply@printera.com',
        },
      }),
    }),
    MongooseModule.forFeature([
      {
        name: MailTemplateEntity.name,
        schema: MailTemplateSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: MailHistoryEntity.name,
        schema: MailHistorySchema,
      },
    ]),
  ],
  controllers: [MailController],
  providers: [MailService, MailConsumer, MailTemplateRepository, MailHistoryRepository],
  exports: [MailService],
})
export class MailModule {}
