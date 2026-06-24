import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { BullMQProcessor } from './bullmq.processor';
import { BullMQService } from './bullmq.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'refresh-queue',
    }),
    MailModule,
  ],
  // [QUEUE-disabled] tạm tắt BullMQProcessor (mail worker) — restore = thêm lại.
  providers: [/* BullMQProcessor, */ BullMQService],
})
export class BullMQModule {}
