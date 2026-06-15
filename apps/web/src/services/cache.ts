import { CONFIG } from '../constants';
import { callApi } from '../apis';

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
