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

const updateTier = (id: string, tier: number | null) => {
  return callApi(`/${CONFIG.API_VERSION}/customers/${id}/tier`, 'patch', { tier });
};

const importTiers = (rows: { userSku: string; tier: number }[]) => {
  return callApi(`/${CONFIG.API_VERSION}/customers/import-tiers`, 'post', { rows });
};

export const customer = { list, create, sync, updateTier, importTiers };
