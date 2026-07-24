import type { CreateCollectionDto, UpdateCollectionDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getCollections = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/collections${query}`, 'get');
};

const createCollection = (data: CreateCollectionDto) => {
  return callApi(`/${CONFIG.API_VERSION}/collections`, 'post', data);
};

const updateCollection = (id: string, data: UpdateCollectionDto) => {
  return callApi(`/${CONFIG.API_VERSION}/collections/${id}`, 'patch', data);
};

export const collection = { getCollections, createCollection, updateCollection };
