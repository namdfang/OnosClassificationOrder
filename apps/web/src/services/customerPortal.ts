import type { CustomerLoginDto, CustomerRegisterDto, PlaceCustomerOrderDto, UpdateCustomerOrderDto } from 'shared';

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

const updateMe = (data: { fullName?: string; phone?: string }) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/auth/me`, 'patch', data);
};

const changePassword = (data: { currentPassword: string; newPassword: string }) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/auth/change-password`, 'post', data);
};

export const customerAuth = { register, login, getMe, updateMe, changePassword };

const placeOrder = (data: PlaceCustomerOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders`, 'post', data);
};

const listOrders = (page = 1, limit = 20) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders?page=${page}&limit=${limit}`, 'get');
};

const trackOrder = (productionId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/${encodeURIComponent(productionId)}`, 'get');
};

const updateOrder = (productionId: string, data: UpdateCustomerOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/${encodeURIComponent(productionId)}`, 'patch', data);
};

export const customerOrder = { placeOrder, listOrders, trackOrder, updateOrder };

const getCatalog = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/customer/catalog${query}`, 'get');
};

const getCatalogItem = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/catalog/${encodeURIComponent(id)}`, 'get');
};

export const customerCatalog = { getCatalog, getCatalogItem };

const listNotifications = (page = 1, limit = 20) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/notifications?page=${page}&limit=${limit}`, 'get');
};

const markNotificationsRead = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer/notifications/read`, 'post');
};

export const customerNotificationPortal = { listNotifications, markNotificationsRead };
