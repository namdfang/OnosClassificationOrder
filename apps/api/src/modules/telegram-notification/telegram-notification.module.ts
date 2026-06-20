import { Module } from '@nestjs/common';

import { TelegramNotificationService } from './telegram-notification.service';

@Module({
  providers: [TelegramNotificationService],
  exports: [TelegramNotificationService],
})
export class TelegramNotificationModule {}
