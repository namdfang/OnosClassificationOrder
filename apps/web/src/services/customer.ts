import { callApi } from '../apis';
import { CONFIG } from '../constants';

export interface ListCustomersParams {
  search?: string;
  page?: number;
  limit?: number;
  tier?: string;
  status?: string;
  source?: string;
  hasAccount?: 'true' | 'false';
  deleted?: boolean;
}

const list = (params?: ListCustomersParams | string) => {
  // Backward-compatible: chữ ký cũ list(search?: string) vẫn dùng được (kanban).
  const obj: ListCustomersParams = typeof params === 'string' ? { search: params } : params ?? {};
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return callApi(`/${CONFIG.API_VERSION}/customers${suffix}`, 'get');
};

const create = (data: {
  userSku: string;
  userEmail?: string;
  fullName?: string;
  phone?: string;
  tier?: number | null;
  password?: string;
}) => {
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

const update = (id: string, data: { fullName?: string; phone?: string; tier?: number | null }) => {
  return callApi(`/${CONFIG.API_VERSION}/customers/${id}`, 'patch', data);
};

const resetPassword = (id: string, password?: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customers/${id}/reset-password`, 'post', password ? { password } : {});
};

const updateStatus = (id: string, status: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customers/${id}/status`, 'patch', { status });
};

const softDelete = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customers/${id}`, 'delete');
};

const restore = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customers/${id}/restore`, 'post');
};

export const customer = {
  list,
  create,
  sync,
  updateTier,
  importTiers,
  update,
  resetPassword,
  updateStatus,
  softDelete,
  restore,
};
