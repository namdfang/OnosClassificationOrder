import { callApi } from '../apis';
import { CONFIG } from '../constants';

const clearAll = () => {
  return callApi(`/${CONFIG.API_VERSION}/cache/clear`, 'get');
};

const clearAllProducts = () => {
  return callApi(`/${CONFIG.API_VERSION}/cache/clear/products`, 'get');
};

const clearAllUsers = () => {
  return callApi(`/${CONFIG.API_VERSION}/cache/clear/users`, 'get');
};

export const cache = {
  clearAll,
  clearAllProducts,
  clearAllUsers,
};
