import { callApi } from '../apis';
import { CONFIG } from '../constants';

/** 3 view báo cáo Telegram — khớp `ReportKind` BE. Xưởng = `daily` + `factoryId`. */
export type ReportView = 'daily' | 'designer' | 'tool-check';

/** Gửi ngay 1 view báo cáo vào Telegram — `factoryId` = lọc phễu theo 1 xưởng. BE trả `{ ok, busy? }`. */
const runNow = (view: ReportView = 'daily', factoryId?: string) => {
  const q = new URLSearchParams({ view });
  if (factoryId) q.set('factoryId', factoryId);

  return callApi(`/${CONFIG.API_VERSION}/reports/run-now?${q.toString()}`, 'post');
};

export const reports = { runNow };
