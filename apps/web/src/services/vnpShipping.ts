import type { CreateVnpFromAddressDto, CreateVnpShipmentDto, ImportVnpFromAddressDto, SaveVnpShippingMapDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

/** VNP eGlobal — vận đơn/label (giai đoạn test, nút "Vận đơn VNP" ở bảng đơn). */

const getStatus = () => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/status`, 'get');
};

const getWallet = () => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/wallet`, 'get');
};

const getConfig = () => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/config`, 'get');
};

const createFromAddress = (data: CreateVnpFromAddressDto) => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/from-addresses`, 'post', data);
};

const getRemoteAddresses = () => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/remote-addresses`, 'get');
};

const importFromAddress = (data: ImportVnpFromAddressDto) => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/from-addresses/import`, 'post', data);
};

const saveMap = (data: SaveVnpShippingMapDto) => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/config/map`, 'put', data);
};

const deleteFromAddress = (vnpAddressId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/from-addresses/${vnpAddressId}`, 'delete');
};

const getGroup = (orderId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/orders/${orderId}/group`, 'get');
};

const checkAddress = (orderId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/orders/${orderId}/check-address`, 'post');
};

const createShipment = (orderId: string, data: CreateVnpShipmentDto) => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/orders/${orderId}/shipment`, 'post', data);
};

const getTracking = (orderId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/orders/${orderId}/tracking`, 'get');
};

const getShipmentDetail = (orderId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/orders/${orderId}/shipment-detail`, 'get');
};

const cancelShipment = (orderId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/shipping-vnp/orders/${orderId}/cancel`, 'put');
};

export const vnpShipping = {
  getStatus,
  getWallet,
  getConfig,
  createFromAddress,
  getRemoteAddresses,
  importFromAddress,
  saveMap,
  deleteFromAddress,
  getGroup,
  checkAddress,
  createShipment,
  getTracking,
  getShipmentDetail,
  cancelShipment,
};
