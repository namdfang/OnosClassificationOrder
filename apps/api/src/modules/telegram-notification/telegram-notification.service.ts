import { Inject, Injectable } from '@nestjs/common';
import type { TelegramReplyMarkup } from 'core';
import { TelegramService } from 'core';
import { Logger } from 'winston';

import { ApiConfigService } from '@/shared/services';

import {
  formatDailyOrdersReport,
  formatDesignerViewReport,
  formatDetailReport,
  formatToolCheckReport,
} from './format/daily-orders-report.formatter';
import type { DailyOrdersReportNotification, NotificationChannelKey, TelegramMention } from './types';

/**
 * Hàng nút dưới mỗi message báo cáo — dựng ĐỘNG theo danh sách xưởng: mỗi xưởng
 * 1 nút `🏭 <tên>` (callback `rpt:fac:<id>`) → gửi phễu lọc theo xưởng đó.
 */
function buildReportKeyboard(factories: DailyOrdersReportNotification['data']['factories']): TelegramReplyMarkup {
  const facButtons = factories.map((f) => ({ text: `🏭 ${f.name}`, callback_data: `rpt:fac:${f.id}` }));

  return {
    inline_keyboard: [
      [
        { text: '🔄 Cập nhật', callback_data: 'rpt:daily' },
        { text: '📋 Chi tiết', callback_data: 'rpt:detail' },
        { text: '👤 Designer', callback_data: 'rpt:designer' },
        { text: '🔍 Soát tool', callback_data: 'rpt:tool' },
      ],
      ...(facButtons.length > 0 ? [facButtons] : []),
    ],
  };
}

@Injectable()
export class TelegramNotificationService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly config: ApiConfigService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  /** `factoryName` có = phễu lọc theo 1 xưởng (nút "🏭 <tên>"). */
  async notifyDailyOrdersReport(payload: DailyOrdersReportNotification, factoryName?: string): Promise<void> {
    const text = withMentions(formatDailyOrdersReport(payload, factoryName), payload.mentions);
    await this.dispatch('dailyReport', text, buildReportKeyboard(payload.data.factories));
  }

  /** View "📋 Chi tiết" — phễu vòng đời + khách ưu tiên (view chính cũ trước khi chuyển SLA-only). */
  async notifyDetailReport(payload: DailyOrdersReportNotification): Promise<void> {
    const text = withMentions(formatDetailReport(payload), payload.mentions);
    await this.dispatch('dailyReport', text, buildReportKeyboard(payload.data.factories));
  }

  async notifyDesignerViewReport(payload: DailyOrdersReportNotification): Promise<void> {
    const text = withMentions(formatDesignerViewReport(payload), payload.mentions);
    await this.dispatch('dailyReport', text, buildReportKeyboard(payload.data.factories));
  }

  async notifyToolCheckReport(payload: DailyOrdersReportNotification): Promise<void> {
    const text = withMentions(formatToolCheckReport(payload), payload.mentions);
    await this.dispatch('dailyReport', text, buildReportKeyboard(payload.data.factories));
  }

  private async dispatch(key: NotificationChannelKey, text: string, replyMarkup?: TelegramReplyMarkup): Promise<void> {
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
          replyMarkup,
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

  /** Danh sách chat_id hợp lệ của channel báo cáo — webhook dùng làm allowlist callback. */
  reportChannelIds(): string[] {
    return this.channelsFor('dailyReport');
  }

  private channelsFor(key: NotificationChannelKey): string[] {
    const c = this.config.telegram;
    const csv = (s: string) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

    switch (key) {
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
  const cc = mentions.map((m) => `[${escapeMd(m.displayName)}](tg://user?id=${m.telegramUserId})`).join(' ');

  return `${text}\n\ncc: ${cc}`;
}

function escapeMd(s: string): string {
  return s.replace(/([_*`[\]])/g, '\\$1');
}
