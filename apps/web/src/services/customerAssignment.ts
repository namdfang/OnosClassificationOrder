import type { CustomerAssignmentConfig, CustomerPriorityConfig } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getConfig = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer-assignment/config`, 'get');
};

const saveConfig = (data: CustomerAssignmentConfig) => {
  return callApi(`/${CONFIG.API_VERSION}/customer-assignment/config`, 'put', data);
};

const getPriorityConfig = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer-assignment/priority-config`, 'get');
};

const savePriorityConfig = (data: CustomerPriorityConfig) => {
  return callApi(`/${CONFIG.API_VERSION}/customer-assignment/priority-config`, 'put', data);
};

export const customerAssignment = { getConfig, saveConfig, getPriorityConfig, savePriorityConfig };
