import type { CreateNotificationDto, UpdateNotificationDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getAllNotifications = (query: string) => {
  return callApi(`/${CONFIG.API_VERSION}/notifications${query || ''}`, 'get');
};

const createNotification = (data: CreateNotificationDto) => {
  return callApi(`/${CONFIG.API_VERSION}/notifications`, 'post', data);
};

const updateNotification = (id: string, data: UpdateNotificationDto) => {
  return callApi(`/${CONFIG.API_VERSION}/notifications/${id}`, 'patch', data);
};

const getDetailNotification = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/notifications/${id}`, 'get');
};

const deleteNotification = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/notifications/${id}`, 'delete');
};

const unseen = () => {
  return callApi(`/${CONFIG.API_VERSION}/notifications/unseen`, 'get');
};

const seen = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/notifications/${id}/seen`, 'get');
};

const seenAllNotifications = () => {
  return callApi(`/${CONFIG.API_VERSION}/notifications/seen-all-notifications`, 'get');
};

export const notifications = {
  getAllNotifications,
  createNotification,
  updateNotification,
  getDetailNotification,
  deleteNotification,
  unseen,
  seen,
  seenAllNotifications,
};
