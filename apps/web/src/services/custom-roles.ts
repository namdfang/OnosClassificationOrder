import type { CreateCustomRoleDto } from 'shared';

import { callApi } from '../apis';

const getCustomRoles = (query: string) => {
  return callApi(`/v1/customRoles${query}`, 'get');
};

const createCustomRole = (data: CreateCustomRoleDto) => {
  return callApi(`/v1/customRoles`, 'post', data);
};

const updateCustomRole = (id: string, data: any) => {
  return callApi(`/v1/customRoles/${id}`, 'patch', data);
};

export const customRoles = {
  getCustomRoles,
  createCustomRole,
  updateCustomRole,
};
