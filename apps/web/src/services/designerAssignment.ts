import type { DesignerAssignmentConfig, RememberProductAssignment } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getConfig = () => {
  return callApi(`/${CONFIG.API_VERSION}/designer-assignment/config`, 'get');
};

const saveConfig = (data: DesignerAssignmentConfig) => {
  return callApi(`/${CONFIG.API_VERSION}/designer-assignment/config`, 'put', data);
};

const rememberProducts = (data: RememberProductAssignment) => {
  return callApi(`/${CONFIG.API_VERSION}/designer-assignment/remember-products`, 'post', data);
};

export const designerAssignment = { getConfig, saveConfig, rememberProducts };
