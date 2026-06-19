import type {
  BulkTransferOrderDto,
  BulkUpdateOrderFieldDto,
  ImportProductionOrdersDto,
  TransferOrderDto,
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

const getWorkshopFilters = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/workshop-filters${query}`, 'get');
};

const getFactoryOverview = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/factory-overview${query}`, 'get');
};

const transferOrder = (id: string, data: TransferOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}/transfer`, 'patch', data);
};

const bulkTransferOrders = (data: BulkTransferOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/bulk-transfer`, 'patch', data);
};

const backfillFabric = () => {
  return callApi(`/${CONFIG.API_VERSION}/orders/backfill-fabric`, 'post');
};

const exportOrders = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/export${query}`, 'get');
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
  getWorkshopFilters,
  getFactoryOverview,
  transferOrder,
  bulkTransferOrders,
  backfillFabric,
  exportOrders,
};
