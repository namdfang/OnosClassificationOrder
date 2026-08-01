import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TelegramService } from 'core';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { TelegramNotificationService } from '../telegram-notification/telegram-notification.service';
import type { ReportCallbackData } from '../telegram-notification/types';
import { REPORT_CALLBACKS, REPORT_FACTORY_PREFIX } from '../telegram-notification/types';
import { ScheduledReportsService } from './scheduled-reports.service';

/**
 * Payload update từ Telegram (schema ngoài hệ thống — không qua Zod DTO, chỉ
 * đọc đúng các field cần; mọi request đã bị chặn ở secret token trước đó).
 */
type TelegramUpdateBody = {
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number | string } };
  };
};

/**
 * Webhook nhận callback nút bấm trên message báo cáo Telegram. Public (Telegram
 * gọi vào, không JWT) — bảo vệ 3 lớp:
 * 1. Header `X-Telegram-Bot-Api-Secret-Token` phải khớp env `TELEGRAM_WEBHOOK_SECRET`
 *    (đăng ký cùng `setWebhook` lúc boot) — sai/thiếu → 401, chưa chạm logic nào.
 * 2. Allowlist chat_id: chỉ nhận callback từ đúng channel báo cáo đã cấu hình.
 * 3. Khóa in-flight ở `ScheduledReportsService.run()` — đang chạy thì người bấm
 *    sau nhận toast "chờ xong rồi bấm lại" thay vì chạy chồng.
 */
@Controller('telegram')
@ApiTags('telegram')
export class TelegramWebhookController {
  constructor(
    private readonly reports: ScheduledReportsService,
    private readonly telegramNotification: TelegramNotificationService,
    private readonly telegramService: TelegramService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Post('webhook')
  @Auth([], [], { public: true })
  @ApiOperation({ summary: 'Telegram bot webhook — callback nút bấm báo cáo' })
  @HttpCode(HttpStatus.OK)
  webhook(
    @Body() update: TelegramUpdateBody,
    @Headers('x-telegram-bot-api-secret-token') secretHeader?: string,
  ): { ok: true } {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    if (!expected || secretHeader !== expected) {
      throw new UnauthorizedException();
    }

    const cq = update?.callback_query;
    if (!cq?.id) return { ok: true };

    const chatId = String(cq.message?.chat?.id ?? '');
    const allowed = this.telegramNotification.reportChannelIds();
    this.logger.info({
      message: JSON.stringify({ method: 'POST', url: '/telegram/webhook', chatId, data: cq.data }),
    });

    // Nút xưởng `rpt:fac:<id>` → phễu lọc theo xưởng; còn lại tra map view.
    const data = cq.data ?? '';
    const factoryId = data.startsWith(REPORT_FACTORY_PREFIX) ? data.slice(REPORT_FACTORY_PREFIX.length) : undefined;
    const kind = factoryId ? 'daily' : REPORT_CALLBACKS[data as ReportCallbackData];
    if (!allowed.includes(chatId) || !kind) {
      void this.telegramService.answerCallbackQuery(cq.id);

      return { ok: true };
    }

    if (this.reports.isRunning) {
      void this.telegramService.answerCallbackQuery(cq.id, '⏳ Báo cáo đang chạy — chờ xong rồi bấm lại nhé');

      return { ok: true };
    }

    // Trả 200 cho Telegram ngay, báo cáo gửi nền (aggregate + send ~1-2s).
    void this.telegramService.answerCallbackQuery(cq.id, '📤 Đang gửi báo cáo mới nhất...');
    void this.reports.run(kind, factoryId);

    return { ok: true };
  }
}
