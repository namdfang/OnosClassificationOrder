import { Inject, Injectable } from '@nestjs/common';
import { TelegramService } from 'core';
import { Logger } from 'winston';

import { ApiConfigService } from '@/shared/services';

import { formatDesignerReport } from './format/designer-report.formatter';
import { formatErrorReport } from './format/error-report.formatter';
import { formatFactoryReport } from './format/factory-report.formatter';
import { formatImportSummary } from './format/import-summary.formatter';
import type {
  DesignerReportNotification,
  ErrorReportNotification,
  FactoryReportNotification,
  ImportSummaryNotification,
  NotificationChannelKey,
  TelegramMention,
} from './types';

@Injectable()
export class TelegramNotificationService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly config: ApiConfigService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  async notifyImportSummary(payload: ImportSummaryNotification): Promise<void> {
    const text = formatImportSummary(payload);
    await this.dispatch('importSummary', text);
  }

  async notifyDesignerReport(payload: DesignerReportNotification): Promise<void> {
    const text = withMentions(formatDesignerReport(payload), payload.mentions);
    await this.dispatch('dailyReport', text);
  }

  async notifyFactoryReport(payload: FactoryReportNotification): Promise<void> {
    const text = withMentions(formatFactoryReport(payload), payload.mentions);
    await this.dispatch('dailyReport', text);
  }

  async notifyErrorReport(payload: ErrorReportNotification): Promise<void> {
    const text = withMentions(formatErrorReport(payload), payload.mentions);
    await this.dispatch('dailyReport', text);
  }

  private async dispatch(key: NotificationChannelKey, text: string): Promise<void> {
    if (!this.config.telegram.notificationEnabled) return;

    const channels = this.channelsFor(key);
    if (channels.length === 0) {
      this.logger.info({
        message: `[telegram-notification][WARN] ${key} skipped: no channel configured`,
      });

      return;
    }

    const results = await Promise.allSettled(
      channels.map((id) =>
        this.telegramService.sendMessageToChannel(id, text, {
          parseMode: 'Markdown',
          disableWebPagePreview: true,
        }),
      ),
    );

    const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value));
    if (failures.length > 0) {
      this.logger.info({
        message: `[telegram-notification][WARN] ${key} ${failures.length}/${channels.length} channel(s) failed`,
      });
    }
  }

  private channelsFor(key: NotificationChannelKey): string[] {
    const c = this.config.telegram;
    const csv = (s: string) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

    switch (key) {
      case 'importSummary':
      case 'hourlyStats':
      case 'dailyReport':
        return csv(c.notificationChannelId || c.channelId || '');
      case 'criticalError':
        return csv(c.scanNotificationChannelId || c.channelId || '');
      default:
        return [];
    }
  }
}

function withMentions(text: string, mentions?: TelegramMention[]): string {
  if (!mentions || mentions.length === 0) return text;
  const cc = mentions
    .map((m) => `[${escapeMd(m.displayName)}](tg://user?id=${m.telegramUserId})`)
    .join(' ');

  return `${text}\n\ncc: ${cc}`;
}

function escapeMd(s: string): string {
  return s.replace(/([_*`\[\]])/g, '\\$1');
}
