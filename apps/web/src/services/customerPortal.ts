import type { CustomerLoginDto, CustomerRegisterDto, PlaceCustomerOrderDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const register = (data: CustomerRegisterDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/auth/register`, 'post', data);
};

const login = (data: CustomerLoginDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/auth/login`, 'post', data);
};

const getMe = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer/auth/me`, 'get');
};

export const customerAuth = { register, login, getMe };

const placeOrder = (data: PlaceCustomerOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders`, 'post', data);
};

const listOrders = (page = 1, limit = 20) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders?page=${page}&limit=${limit}`, 'get');
};

const trackOrder = (productionId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/${encodeURIComponent(productionId)}`, 'get');
};

export const customerOrder = { placeOrder, listOrders, trackOrder };

const getCatalog = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/customer/catalog${query}`, 'get');
};

export const customerCatalog = { getCatalog };
