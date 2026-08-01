import type { DailyOrdersReportData } from '../scheduled-reports/types';

export type ImportSummaryNotification = {
  triggeredBy?: { email?: string; fullName?: string };
  totals: {
    imported: number;
    updated: number;
    skipped: number;
  };
  byFactory: Array<{ name: string; count: number }>;
  unassignedFactoryCount: number;
  startedAt: Date;
  finishedAt: Date;
};

/**
 * Payload chung 3 view báo cáo (chính / theo designer / theo xưởng) — cùng 1
 * lần aggregate `DailyOrdersReportData`, formatter cắt lát khác nhau.
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

export type NotificationChannelKey = 'importSummary' | 'hourlyStats' | 'criticalError' | 'dailyReport';

/**
 * `callback_data` các nút gắn dưới message báo cáo — webhook
 * (`TelegramWebhookController`) tra map này để biết view cần gửi.
 */
export const REPORT_CALLBACKS = {
  'rpt:daily': 'daily',
  'rpt:designer': 'designer',
  'rpt:tool': 'tool-check',
} as const;
export type ReportCallbackData = keyof typeof REPORT_CALLBACKS;

/** Prefix nút xưởng — callback đầy đủ `rpt:fac:<factoryId>`. */
export const REPORT_FACTORY_PREFIX = 'rpt:fac:';
