import type { CreateRoleDto, UpdateRolePermissionsDto } from 'shared';
import { callApi } from '../apis';

const getRoles = (query: string) => {
  return callApi(`/v1/roles${query}`, 'get');
};

const createRole = (data: CreateRoleDto) => {
  return callApi(`/v1/roles`, 'post', data);
};

const updateRole = (id: string, data: any) => {
  return callApi(`/v1/roles/${id}`, 'patch', data);
};

const updatePermissions = (id: string, data: UpdateRolePermissionsDto) => {
  return callApi(`/v1/roles/${id}/permissions`, 'patch', data);
};

const resetPermissions = (id: string) => {
  return callApi(`/v1/roles/${id}/reset-permissions`, 'post');
};

const deleteRole = (id: string) => {
  return callApi(`/v1/roles/${id}`, 'delete');
};

export const roles = {
  getRoles,
  createRole,
  updateRole,
  updatePermissions,
  resetPermissions,
  deleteRole,
};
