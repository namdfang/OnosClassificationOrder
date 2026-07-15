import { callApi } from '../apis';
import { CONFIG } from '../constants';

const list = (search?: string) => {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return callApi(`/${CONFIG.API_VERSION}/customers${qs}`, 'get');
};

const create = (data: { userSku: string; userEmail?: string }) => {
  return callApi(`/${CONFIG.API_VERSION}/customers`, 'post', data);
};

const sync = () => {
  return callApi(`/${CONFIG.API_VERSION}/customers/sync`, 'post');
};

export const customer = { list, create, sync };
