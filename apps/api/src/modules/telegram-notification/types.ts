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

export type NotificationChannelKey = 'importSummary' | 'hourlyStats' | 'criticalError';
