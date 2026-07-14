import type { DesignerAssignmentConfig } from 'shared';
import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getConfig = () => {
  return callApi(`/${CONFIG.API_VERSION}/designer-assignment/config`, 'get');
};

const saveConfig = (data: DesignerAssignmentConfig) => {
  return callApi(`/${CONFIG.API_VERSION}/designer-assignment/config`, 'put', data);
};

export const designerAssignment = { getConfig, saveConfig };
