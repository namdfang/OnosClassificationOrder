import type {
  BulkAssignDesignerDto,
  BulkAssignDesignerPreviewDto,
  BulkAssignOrderDto,
  BulkTransferOrderDto,
  BulkUpdateOrderFieldDto,
  ImportProductionOrdersDto,
  ImportReworkOrdersDto,
  SetProductionErrorDto,
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

const importRework = (data: ImportReworkOrdersDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/import-rework`, 'post', data);
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

const bulkAssignOrders = (data: BulkAssignOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/bulk-assign`, 'patch', data);
};

const backfillFabric = () => {
  return callApi(`/${CONFIG.API_VERSION}/orders/backfill-fabric`, 'post');
};

const exportOrders = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/export${query}`, 'get');
};

const getDesignerBreakdown = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/designer-breakdown${query}`, 'get');
};

const bulkAssignDesignerPreview = (data: BulkAssignDesignerPreviewDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/bulk-assign-designer-preview`, 'post', data);
};

const bulkAssignDesigner = (data: BulkAssignDesignerDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/bulk-assign-designer`, 'post', data);
};

const setProductionError = (id: string, data: SetProductionErrorDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}/set-production-error`, 'post', data);
};

const getErrorLog = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/error-log${query}`, 'get');
};

const checkPendingDesigns = (ids: string[]) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/check-pending`, 'post', { ids });
};

const ensurePreview = (sourceUrl: string) => {
  return callApi(`/${CONFIG.API_VERSION}/design-image/ensure-preview`, 'post', { sourceUrl });
};

export const order = {
  getOrders,
  importOrders,
  importRework,
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
  bulkAssignOrders,
  backfillFabric,
  exportOrders,
  getDesignerBreakdown,
  bulkAssignDesignerPreview,
  bulkAssignDesigner,
  setProductionError,
  getErrorLog,
  checkPendingDesigns,
  ensurePreview,
};
