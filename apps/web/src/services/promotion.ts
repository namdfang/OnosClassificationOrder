import type { CreatePromotionDto, UpdatePromotionDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getPromotions = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/promotions${query}`, 'get');
};

const getStats = () => {
  return callApi(`/${CONFIG.API_VERSION}/promotions/stats`, 'get');
};

const createPromotion = (data: CreatePromotionDto) => {
  return callApi(`/${CONFIG.API_VERSION}/promotions`, 'post', data);
};

const updatePromotion = (id: string, data: UpdatePromotionDto) => {
  return callApi(`/${CONFIG.API_VERSION}/promotions/${id}`, 'patch', data);
};

const deletePromotion = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/promotions/${id}`, 'delete');
};

export const promotion = { getPromotions, getStats, createPromotion, updatePromotion, deletePromotion };
