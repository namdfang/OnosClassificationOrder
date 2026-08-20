import type {
  CancelCustomerStagingOrderDto,
  CreateCustomerApiKeyDto,
  CreateCustomerWebhookDto,
  CustomerLoginDto,
  CustomerOrderStatus,
  CustomerRegisterDto,
  ImportCustomerOrdersDto,
  PlaceCustomerOrderDto,
  PushCustomerOrdersDto,
  ResolveImportSkusDto,
  UpdateCustomerOrderDto,
  UpdateCustomerStagingOrderDto,
} from 'shared';

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

const listOrders = (
  page = 1,
  limit = 20,
  filters?: { search?: string; status?: CustomerOrderStatus | ''; held?: boolean },
) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters?.search?.trim()) params.set('search', filters.search.trim());
  if (filters?.status) params.set('status', filters.status);
  if (filters?.held) params.set('held', 'true');
  return callApi(`/${CONFIG.API_VERSION}/customer/orders?${params.toString()}`, 'get');
};

const getCounts = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/counts`, 'get');
};

const importOrders = (data: ImportCustomerOrdersDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/import`, 'post', data);
};

const resolveImportSkus = (data: ResolveImportSkusDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/import/resolve`, 'post', data);
};

const previewPush = (data: PushCustomerOrdersDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/push-preview`, 'post', data);
};

const pushToProduction = (data: PushCustomerOrdersDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/push`, 'post', data);
};

const updateStagingOrder = (id: string, data: UpdateCustomerStagingOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/staging/${encodeURIComponent(id)}`, 'patch', data);
};

const cancelStagingOrder = (id: string, data: CancelCustomerStagingOrderDto = {}) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/staging/${encodeURIComponent(id)}/cancel`, 'post', data);
};

const listProductTypes = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/product-types`, 'get');
};

const getDashboard = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/dashboard`, 'get');
};

const trackOrder = (productionId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/${encodeURIComponent(productionId)}`, 'get');
};

const updateOrder = (productionId: string, data: UpdateCustomerOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/orders/${encodeURIComponent(productionId)}`, 'patch', data);
};

export const customerOrder = {
  placeOrder,
  listOrders,
  getCounts,
  importOrders,
  resolveImportSkus,
  previewPush,
  pushToProduction,
  updateStagingOrder,
  cancelStagingOrder,
  listProductTypes,
  getDashboard,
  trackOrder,
  updateOrder,
};

const getCatalog = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/customer/catalog${query}`, 'get');
};

const getCatalogItem = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/catalog/${encodeURIComponent(id)}`, 'get');
};

const getCatalogFacets = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer/catalog/facets`, 'get');
};

export const customerCatalog = { getCatalog, getCatalogItem, getCatalogFacets };

// Design storage (R2 + worker riêng) — upload trực tiếp browser → R2 qua presigned URL.
const presignDesignUpload = (data: { sha256: string; size: number; mime: string; fileName?: string }) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/designs/presign`, 'post', data);
};

const confirmDesignUpload = (data: { tmpKey: string; sha256: string; fileName?: string }) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/designs/confirm`, 'post', data);
};

const getDesignFile = (sha256: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/designs/${sha256}`, 'get');
};

export const customerDesign = { presignDesignUpload, confirmDesignUpload, getDesignFile };

const listNotifications = (page = 1, limit = 20) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/notifications?page=${page}&limit=${limit}`, 'get');
};

const markNotificationsRead = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer/notifications/read`, 'post');
};

export const customerNotificationPortal = { listNotifications, markNotificationsRead };

// ─── API keys + webhooks — Public Order API (ORD-4) ─────────────────────────

const listApiKeys = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer/api-keys`, 'get');
};

/** Response chứa `key` plain — CHỈ hiện 1 lần ở dialog, KHÔNG lưu lại. */
const createApiKey = (data: CreateCustomerApiKeyDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/api-keys`, 'post', data);
};

const revokeApiKey = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/api-keys/${id}`, 'delete');
};

const listWebhooks = () => {
  return callApi(`/${CONFIG.API_VERSION}/customer/webhooks`, 'get');
};

const createWebhook = (data: CreateCustomerWebhookDto) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/webhooks`, 'post', data);
};

const deleteWebhook = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/customer/webhooks/${id}`, 'delete');
};

export const customerApiAccess = {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  listWebhooks,
  createWebhook,
  deleteWebhook,
};
