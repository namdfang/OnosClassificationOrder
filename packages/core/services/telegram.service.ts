import { Injectable } from '@nestjs/common';
import axios from 'axios';

type TelegramConfig = {
  botToken: string;
};

export type TelegramParseMode = 'Markdown' | 'MarkdownV2' | 'HTML';

export type TelegramInlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

export type SendMessageOptions = {
  parseMode?: TelegramParseMode;
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
  timeoutMs?: number;
  /** Inline keyboard gắn dưới message — ai bấm nút Telegram bắn `callback_query` về webhook. */
  replyMarkup?: TelegramReplyMarkup;
};

@Injectable()
export class TelegramService {
  constructor(private telegramConfig: TelegramConfig) {}

  async sendMessageToChannel(channelId: string, message: string, options: SendMessageOptions = {}): Promise<boolean> {
    if (!channelId || !this.telegramConfig.botToken) {
      console.warn('[telegram] missing channelId or botToken — skip send');

      return false;
    }

    return this.callApi(
      'sendMessage',
      {
        chat_id: channelId,
        text: message,
        parse_mode: options.parseMode,
        disable_web_page_preview: options.disableWebPagePreview,
        disable_notification: options.disableNotification,
        reply_markup: options.replyMarkup,
      },
      options.timeoutMs,
    );
  }

  /**
   * Trả lời 1 lần bấm nút inline keyboard — BẮT BUỘC gọi sau mỗi `callback_query`
   * để nút hết trạng thái loading; `text` (nếu có) hiện dạng toast nhỏ trên Telegram.
   */
  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    if (!callbackQueryId || !this.telegramConfig.botToken) return false;

    return this.callApi('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
  }

  /**
   * Đăng ký webhook nhận update (callback_query) — Telegram sẽ POST tới `url`
   * kèm header `X-Telegram-Bot-Api-Secret-Token: <secretToken>` để server verify.
   */
  async setWebhook(url: string, secretToken: string): Promise<boolean> {
    if (!url || !this.telegramConfig.botToken) return false;

    return this.callApi('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['callback_query'],
    });
  }

  private async callApi(method: string, body: Record<string, unknown>, timeoutMs?: number): Promise<boolean> {
    const rawToken = this.telegramConfig.botToken;
    const token = rawToken.startsWith('bot') ? rawToken.slice(3) : rawToken;
    const url = `https://api.telegram.org/bot${token}/${method}`;

    try {
      await axios.post(url, body, {
        timeout: timeoutMs ?? 5000,
        headers: { 'Content-Type': 'application/json' },
      });

      return true;
    } catch (error) {
      const desc = axios.isAxiosError(error)
        ? error.response?.data?.description || error.message
        : (error as Error)?.message;
      console.warn(`[telegram] ${method} failed:`, desc);

      return false;
    }
  }
}
