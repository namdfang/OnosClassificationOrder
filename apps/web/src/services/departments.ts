import type { CreateDepartmentDto, UpdateDepartmentDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getDepartments = (query: string) => {
  return callApi(`/${CONFIG.API_VERSION}/departments${query || ''}`, 'get');
};

const createDepartment = (data: CreateDepartmentDto) => {
  return callApi(`/${CONFIG.API_VERSION}/departments`, 'post', data);
};

const updateDepartment = (id: string, data: UpdateDepartmentDto) => {
  return callApi(`/${CONFIG.API_VERSION}/departments/${id}`, 'patch', data);
};

const getDetailDepartment = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/departments/${id}`, 'get');
};

const deleteDepartment = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/departments/${id}`, 'delete');
};

export const departments = {
  getDepartments,
  createDepartment,
  updateDepartment,
  getDetailDepartment,
  deleteDepartment,
};
