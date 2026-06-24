import { callApi } from '../apis';
import { CONFIG } from '../constants';

export type ReportSlot = 'morning' | 'noon' | 'evening';
export type ReportType = 'all' | 'designer' | 'factory' | 'error';

const runNow = (params?: { slot?: ReportSlot; report?: ReportType }) => {
  const q = new URLSearchParams();
  if (params?.slot) q.set('slot', params.slot);
  if (params?.report) q.set('report', params.report);
  const qs = q.toString();
  return callApi(`/${CONFIG.API_VERSION}/reports/run-now${qs ? `?${qs}` : ''}`, 'post');
};

export const reports = { runNow };
