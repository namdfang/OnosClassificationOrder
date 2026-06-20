import { Inject, Injectable } from '@nestjs/common';
import { TelegramService } from 'core';
import { Logger } from 'winston';

import { ApiConfigService } from '@/shared/services';

import { formatImportSummary } from './format/import-summary.formatter';
import type { ImportSummaryNotification, NotificationChannelKey } from './types';

@Injectable()
export class TelegramNotificationService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly config: ApiConfigService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  async notifyImportSummary(payload: ImportSummaryNotification): Promise<void> {
    if (!this.config.telegram.notificationEnabled) return;

    const channelId = this.channelFor('importSummary');
    if (!channelId) {
      this.logger.warn({
        message: '[telegram-notification] importSummary skipped: no channel configured',
      });

      return;
    }

    const text = formatImportSummary(payload);
    const ok = await this.telegramService.sendMessageToChannel(channelId, text, {
      parseMode: 'Markdown',
      disableWebPagePreview: true,
    });

    if (!ok) {
      this.logger.warn({ message: '[telegram-notification] importSummary send failed' });
    }
  }

  private channelFor(key: NotificationChannelKey): string | undefined {
    const c = this.config.telegram;
    switch (key) {
      case 'importSummary':
      case 'hourlyStats':
        return c.notificationChannelId || c.channelId || undefined;
      case 'criticalError':
        return c.scanNotificationChannelId || c.channelId || undefined;
      default:
        return undefined;
    }
  }
}
