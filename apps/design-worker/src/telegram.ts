import { config } from './config';

/**
 * Notify lỗi qua Telegram bot sẵn có của hệ thống (optional — thiếu env thì
 * chỉ log console). Gọi thẳng Bot API bằng fetch, không kéo NestJS vào worker.
 */
export async function notifyTelegram(text: string): Promise<void> {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `🖼️ [design-worker] ${text}` }),
    });
  } catch (err) {
    console.warn(`[telegram] notify failed: ${(err as Error).message}`);
  }
}
