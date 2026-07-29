import type { SendCustomerNotificationDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const send = (data: SendCustomerNotificationDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer-notifications`, 'post', data);
};

const listSent = (page = 1, limit = 20) => {
  return callApi(`/${CONFIG.API_VERSION}/customer-notifications/sent?page=${page}&limit=${limit}`, 'get');
};

export const customerNotification = { send, listSent };
