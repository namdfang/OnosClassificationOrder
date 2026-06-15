/* eslint-disable no-console */
import { Injectable } from '@nestjs/common';
import axios from 'axios';

type TelegramConfig = {
  botToken: string;
};

@Injectable()
export class TelegramService {
  constructor(private telegramConfig: TelegramConfig) {}

  async sendMessageToChannel(channelId: string, message: string): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/${this.telegramConfig.botToken}/sendMessage`;

      await axios.get(url, {
        params: {
          chat_id: channelId,
          text: message,
        },
      });

      return true;
    } catch (error) {
      console.log('Error sending message to Telegram:', error);

      return false;
    }
  }
}
