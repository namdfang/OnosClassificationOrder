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
  } = {},
) => {
  const qs = new URLSearchParams();
  if (query.tab) qs.set('tab', query.tab);
  if (query.stage) qs.set('stage', query.stage);
  if (query.factoryId) qs.set('factoryId', query.factoryId);
  if (query.page) qs.set('page', String(query.page));
  if (query.size) qs.set('size', String(query.size));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return callApi(`/${CONFIG.API_VERSION}/fulfillment/my-tasks${suffix}`, 'get');
};

export const fulfillment = {
  transition,
  myTasks,
};
