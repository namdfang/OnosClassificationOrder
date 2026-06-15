import type {
  BulkUpdateOrderFieldDto,
  ImportProductionOrdersDto,
  UpdateOrderFieldDto,
} from 'shared';
import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getOrders = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders${query}`, 'get');
};

const importOrders = (data: ImportProductionOrdersDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/import`, 'post', data);
};

const deleteOrder = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}`, 'delete');
};

const getDashboard = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/dashboard${query}`, 'get');
};

const updateField = (id: string, data: UpdateOrderFieldDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}/field`, 'patch', data);
};

const bulkUpdateField = (data: BulkUpdateOrderFieldDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/bulk-field`, 'patch', data);
};

const getLogs = (id: string, query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}/logs${query}`, 'get');
};

const getStatusOverview = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/status-overview${query}`, 'get');
};

const getImportSummary = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/import-summary${query}`, 'get');
};

const getOrdersGrouped = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/grouped${query}`, 'get');
};

export const order = {
  getOrders,
  importOrders,
  deleteOrder,
  getDashboard,
  updateField,
  bulkUpdateField,
  getLogs,
  getStatusOverview,
  getImportSummary,
  getOrdersGrouped,
};
