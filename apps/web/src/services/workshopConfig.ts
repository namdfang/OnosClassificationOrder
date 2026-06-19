import type {
  CreateWorkshopConfigDto,
  ReorderWorkshopConfigDto,
  UpdateWorkshopConfigDto,
} from 'shared';
import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getAll = () => {
  return callApi(`/${CONFIG.API_VERSION}/workshop-config/all`, 'get');
};

const list = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/workshop-config${query}`, 'get');
};

const create = (data: CreateWorkshopConfigDto) => {
  return callApi(`/${CONFIG.API_VERSION}/workshop-config`, 'post', data);
};

const update = (id: string, data: UpdateWorkshopConfigDto) => {
  return callApi(`/${CONFIG.API_VERSION}/workshop-config/${id}`, 'patch', data);
};

const remove = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/workshop-config/${id}`, 'delete');
};

const reorder = (data: ReorderWorkshopConfigDto) => {
  return callApi(`/${CONFIG.API_VERSION}/workshop-config/reorder`, 'patch', data);
};

const resetCategory = (category: string) => {
  return callApi(`/${CONFIG.API_VERSION}/workshop-config/reset/${category}`, 'post');
};

export const workshopConfig = { getAll, list, create, update, remove, reorder, resetCategory };
