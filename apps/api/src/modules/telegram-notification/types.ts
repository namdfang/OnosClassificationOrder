import type { DailyOrdersReportData } from '../scheduled-reports/types';

/**
 * Payload chung các view báo cáo (SLA / chi tiết / designer / soát tool /
 * xưởng) — cùng 1 lần aggregate `DailyOrdersReportData`, formatter cắt lát
 * khác nhau.
 */
export type DailyOrdersReportNotification = {
  data: DailyOrdersReportData;
  generatedAt: Date;
  /** true = API chạy production, false = dev — hiện nhãn 🟢 PROD / 🧪 DEV đầu message. */
  isProduction: boolean;
  mentions?: TelegramMention[];
};

export type TelegramMention = {
  telegramUserId: string;
  displayName: string;
};

export type NotificationChannelKey = 'hourlyStats' | 'criticalError' | 'dailyReport';

/**
 * `callback_data` các nút gắn dưới message báo cáo — webhook
 * (`TelegramWebhookController`) tra map này để biết view cần gửi.
 */
export const REPORT_CALLBACKS = {
  'rpt:daily': 'daily',
  'rpt:detail': 'detail',
  'rpt:designer': 'designer',
  'rpt:tool': 'tool-check',
} as const;
export type ReportCallbackData = keyof typeof REPORT_CALLBACKS;

/** Prefix nút xưởng — callback đầy đủ `rpt:fac:<factoryId>`. */
export const REPORT_FACTORY_PREFIX = 'rpt:fac:';
