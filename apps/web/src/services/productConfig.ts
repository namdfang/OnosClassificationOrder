import type { CreateProductConfigDto, ImportProductConfigDto, UpdateProductConfigDto } from 'shared';
import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getProductConfigs = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/product-configs${query}`, 'get');
};

const createProductConfig = (data: CreateProductConfigDto) => {
  return callApi(`/${CONFIG.API_VERSION}/product-configs`, 'post', data);
};

const updateProductConfig = (id: string, data: UpdateProductConfigDto) => {
  return callApi(`/${CONFIG.API_VERSION}/product-configs/${id}`, 'patch', data);
};

const deleteProductConfig = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/product-configs/${id}`, 'delete');
};

const importProductConfigs = (data: ImportProductConfigDto) => {
  return callApi(`/${CONFIG.API_VERSION}/product-configs/import`, 'post', data);
};

export const productConfig = {
  getProductConfigs,
  createProductConfig,
  updateProductConfig,
  deleteProductConfig,
  importProductConfigs,
};
