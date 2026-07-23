import type { CreateProductCategoryDto, UpdateProductCategoryDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getProductCategories = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/product-categories${query}`, 'get');
};

const createProductCategory = (data: CreateProductCategoryDto) => {
  return callApi(`/${CONFIG.API_VERSION}/product-categories`, 'post', data);
};

const updateProductCategory = (id: string, data: UpdateProductCategoryDto) => {
  return callApi(`/${CONFIG.API_VERSION}/product-categories/${id}`, 'patch', data);
};

export const productCategory = { getProductCategories, createProductCategory, updateProductCategory };
