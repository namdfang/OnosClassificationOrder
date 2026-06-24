import type {
  DesignerReportData,
  ErrorReportData,
  FactoryReportData,
  ReportPeriod,
} from '../scheduled-reports/types';

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

export type DesignerReportNotification = {
  period: ReportPeriod;
  data: DesignerReportData;
  generatedAt: Date;
  mentions?: TelegramMention[];
};

export type FactoryReportNotification = {
  period: ReportPeriod;
  data: FactoryReportData;
  generatedAt: Date;
  mentions?: TelegramMention[];
};

export type ErrorReportNotification = {
  period: ReportPeriod;
  data: ErrorReportData;
  generatedAt: Date;
  mentions?: TelegramMention[];
};

export type TelegramMention = {
  telegramUserId: string;
  displayName: string;
};

export type NotificationChannelKey =
  | 'importSummary'
  | 'hourlyStats'
  | 'criticalError'
  | 'dailyReport';
