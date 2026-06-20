/* eslint-disable no-console */
import { Injectable } from '@nestjs/common';
import axios from 'axios';

type TelegramConfig = {
  botToken: string;
};

export type TelegramParseMode = 'Markdown' | 'MarkdownV2' | 'HTML';

export type SendMessageOptions = {
  parseMode?: TelegramParseMode;
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
  timeoutMs?: number;
};

@Injectable()
export class TelegramService {
  constructor(private telegramConfig: TelegramConfig) {}

  async sendMessageToChannel(channelId: string, message: string, options: SendMessageOptions = {}): Promise<boolean> {
    if (!channelId || !this.telegramConfig.botToken) {
      console.warn('[telegram] missing channelId or botToken — skip send');

      return false;
    }

    const rawToken = this.telegramConfig.botToken;
    const token = rawToken.startsWith('bot') ? rawToken.slice(3) : rawToken;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
      await axios.post(
        url,
        {
          chat_id: channelId,
          text: message,
          parse_mode: options.parseMode,
          disable_web_page_preview: options.disableWebPagePreview,
          disable_notification: options.disableNotification,
        },
        {
          timeout: options.timeoutMs ?? 5000,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      return true;
    } catch (error) {
      const desc = axios.isAxiosError(error)
        ? error.response?.data?.description || error.message
        : (error as Error)?.message;
      console.warn('[telegram] sendMessage failed:', desc);

      return false;
    }
  }
}
