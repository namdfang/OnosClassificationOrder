import type {
  ApplyCuttingFilesDto,
  BulkAssignDesignerDto,
  BulkAssignDesignerPreviewDto,
  BulkAssignOrderDto,
  BulkHoldOrderDto,
  BulkTransferOrderDto,
  BulkUpdateOrderFieldDto,
  CancelOrderDto,
  HoldOrderDto,
  ClaimDesignerTasksDto,
  ImportProductionOrdersDto,
  ImportReworkOrdersDto,
  PreviewCuttingFilesDto,
  SetProductionErrorDto,
  TransferOrderDto,
  UpdateOrderDesignDto,
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

const getFulfillmentStatusCounts = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/fulfillment-status-counts${query}`, 'get');
};

const getFactoryOverview = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/factory-overview${query}`, 'get');
};

const getLifecycleOverview = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/lifecycle-overview${query}`, 'get');
};

const getCancelledOrders = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/cancelled-list${query}`, 'get');
};

const getLifecycleTrack = (code: string) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/lifecycle-track/${encodeURIComponent(code)}`, 'get');
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

const getDesignerBacklog = () => {
  return callApi(`/${CONFIG.API_VERSION}/orders/designer-backlog`, 'get');
};

const bulkAssignDesignerPreview = (data: BulkAssignDesignerPreviewDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/bulk-assign-designer-preview`, 'post', data);
};

const bulkAssignDesigner = (data: BulkAssignDesignerDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/bulk-assign-designer`, 'post', data);
};

const claimDesignerTasks = (data: ClaimDesignerTasksDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/claim-designer-tasks`, 'post', data);
};

const setProductionError = (id: string, data: SetProductionErrorDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}/set-production-error`, 'post', data);
};

const getErrorLog = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/orders/error-log${query}`, 'get');
};

const getByProductionId = (code: string) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/by-production-id/${encodeURIComponent(code)}`, 'get');
};

const checkPendingDesigns = (ids: string[]) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/check-pending`, 'post', { ids });
};

const ensurePreview = (sourceUrl: string) => {
  return callApi(`/${CONFIG.API_VERSION}/design-image/ensure-preview`, 'post', { sourceUrl });
};

const previewCuttingFiles = (data: PreviewCuttingFilesDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/cutting-files/preview`, 'post', data);
};

const applyCuttingFiles = (data: ApplyCuttingFilesDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/cutting-files/apply`, 'post', data);
};

const cancelOrder = (id: string, data: CancelOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}/cancel`, 'post', data);
};

const holdOrder = (id: string, data: HoldOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}/hold`, 'post', data);
};

const unholdOrder = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}/unhold`, 'post', {});
};

const bulkHold = (data: BulkHoldOrderDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/bulk-hold`, 'patch', data);
};

const updateOrderDesign = (id: string, data: UpdateOrderDesignDto) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}/design`, 'patch', data);
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
  getFulfillmentStatusCounts,
  getFactoryOverview,
  getLifecycleOverview,
  getCancelledOrders,
  getLifecycleTrack,
  transferOrder,
  bulkTransferOrders,
  bulkAssignOrders,
  backfillFabric,
  exportOrders,
  getDesignerBreakdown,
  getDesignerBacklog,
  bulkAssignDesignerPreview,
  bulkAssignDesigner,
  claimDesignerTasks,
  setProductionError,
  getErrorLog,
  getByProductionId,
  checkPendingDesigns,
  ensurePreview,
  previewCuttingFiles,
  applyCuttingFiles,
  cancelOrder,
  holdOrder,
  unholdOrder,
  bulkHold,
  updateOrderDesign,
};
