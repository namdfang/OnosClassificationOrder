import type { ChangePasswordDto, CreateUserDto, UpdateUserDto } from 'shared/dtos/user.dto';
import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getUsers = (query: string) => {
  return callApi(`/${CONFIG.API_VERSION}/users${query}`, 'get');
};

const updateUser = (form: UpdateUserDto) => {
  return callApi(`/${CONFIG.API_VERSION}/users/update`, 'post', form);
};

const createUser = (payload: CreateUserDto) => {
  return callApi(`/${CONFIG.API_VERSION}/users`, 'post', payload);
};

const adminUpdateUser = (userId: string, payload: UpdateUserDto) => {
  return callApi(`/${CONFIG.API_VERSION}/users/${userId}`, 'patch', payload);
};

const adminDeleteUser = (userId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/users/${userId}`, 'delete');
};

const toggleActive = (userId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/users/${userId}/toggle-active`, 'post');
};

const resetPassword = (data: any, userid: string) => {
  return callApi(`/${CONFIG.API_VERSION}/users/${userid}/reset-password`, 'post', data);
};

const getLogs = (query: string, userId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/users/logs/${userId}${query}`, 'get');
};

const changePassword = (data: ChangePasswordDto) => {
  return callApi(`/${CONFIG.API_VERSION}/users/change-password`, 'post', data);
};

const forceChangePassword = async (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/users/force-change-password/${id}`, 'get');
};

const clearUserCache = async (userId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/users/${userId}/clear-user-cache`, 'post');
};

export const users = {
  getUsers,
  updateUser,
  createUser,
  adminUpdateUser,
  adminDeleteUser,
  toggleActive,
  resetPassword,
  getLogs,
  changePassword,
  forceChangePassword,
  clearUserCache,
};
