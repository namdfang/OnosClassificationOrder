import type { CreateFactoryDto, UpdateFactoryDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getFactories = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/factories${query}`, 'get');
};

const createFactory = (data: CreateFactoryDto) => {
  return callApi(`/${CONFIG.API_VERSION}/factories`, 'post', data);
};

const updateFactory = (id: string, data: UpdateFactoryDto) => {
  return callApi(`/${CONFIG.API_VERSION}/factories/${id}`, 'patch', data);
};

export const factory = { getFactories, createFactory, updateFactory };
