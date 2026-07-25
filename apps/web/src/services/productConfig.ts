import type { CreateProductConfigDto, ImportProductConfigDto, UpdateProductConfigDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getProductConfigs = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/product-configs${query}`, 'get');
};

const getProductConfig = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/product-configs/${id}`, 'get');
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

const clearAllProductConfigs = () => {
  return callApi(`/${CONFIG.API_VERSION}/product-configs/all`, 'delete');
};

/** `formData` phải có field `type` ('mockup' | 'size-chart') + `file` — multipart/form-data. Lưu local disk, KHÔNG qua S3. */
const uploadProductImage = (formData: FormData) => {
  return callApi(`/${CONFIG.API_VERSION}/product-configs/upload-image`, 'post', formData, 'upload');
};

export const productConfig = {
  getProductConfigs,
  getProductConfig,
  createProductConfig,
  updateProductConfig,
  deleteProductConfig,
  importProductConfigs,
  clearAllProductConfigs,
  uploadProductImage,
};
