import type { FulfillmentStage, FulfillmentTaskTab, FulfillmentTransitionDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const transition = (orderId: string, data: FulfillmentTransitionDto) => {
  return callApi(
    `/${CONFIG.API_VERSION}/orders/${orderId}/fulfillment-transition`,
    'post',
    data,
  );
};

const myTasks = (
  query: {
    tab?: FulfillmentTaskTab;
    stage?: FulfillmentStage;
    factoryId?: string;
    page?: number;
    size?: number;
    /**
     * Date range filter trên `inProductionAt` (YYYY-MM-DD VN local). BE default
     * 7 ngày khi cả 2 đều undefined; empty string = explicit clear → all-time
     * (match scope với `OrderFactoryTab`).
     */
    createdFrom?: string;
    createdTo?: string;
  } = {},
) => {
  const qs = new URLSearchParams();
  if (query.tab) qs.set('tab', query.tab);
  if (query.stage) qs.set('stage', query.stage);
  if (query.factoryId) qs.set('factoryId', query.factoryId);
  if (query.page) qs.set('page', String(query.page));
  if (query.size) qs.set('size', String(query.size));
  // Truyền cả khi empty string — BE phân biệt undefined (default 7d) vs
  // '' (explicit clear → all-time).
  if (query.createdFrom !== undefined) qs.set('createdFrom', query.createdFrom);
  if (query.createdTo !== undefined) qs.set('createdTo', query.createdTo);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return callApi(`/${CONFIG.API_VERSION}/fulfillment/my-tasks${suffix}`, 'get');
};

const dailyOverview = (
  query: { days?: 7 | 14 | 30; from?: string; to?: string; stage?: FulfillmentStage } = {},
) => {
  const qs = new URLSearchParams();
  qs.set('days', String(query.days || 7));
  if (query.from) qs.set('from', query.from);
  if (query.to) qs.set('to', query.to);
  if (query.stage) qs.set('stage', query.stage);
  return callApi(`/${CONFIG.API_VERSION}/fulfillment/daily-overview?${qs.toString()}`, 'get');
};

const myTodayReport = () => {
  return callApi(`/${CONFIG.API_VERSION}/fulfillment/my-today-report`, 'get');
};

export const fulfillment = {
  transition,
  myTasks,
  dailyOverview,
  myTodayReport,
};
