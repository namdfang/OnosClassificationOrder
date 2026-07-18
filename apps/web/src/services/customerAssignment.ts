import type { CustomerAssignmentConfig } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getConfig = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer-assignment/config`, 'get');
};

const saveConfig = (data: CustomerAssignmentConfig) => {
  return callApi(`/${CONFIG.API_VERSION}/customer-assignment/config`, 'put', data);
};

export const customerAssignment = { getConfig, saveConfig };
