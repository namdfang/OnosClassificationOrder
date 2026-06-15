import type { CreateUser, LoginDto, RegisterDto, ResetPasswordDto, UpdateUserDto } from 'shared';
import { CONFIG } from '../constants';
import { callApi } from '../apis';

const login = (form: LoginDto) => {
  return callApi(`/${CONFIG.API_VERSION}/auth/login`, 'post', form);
};

const register = (form: RegisterDto) => {
  return callApi(`/${CONFIG.API_VERSION}/auth/register`, 'post', form);
};

const logout = () => {
  return callApi(`/${CONFIG.API_VERSION}/auth/logout`, 'get');
};

const resetPassword = (form: ResetPasswordDto) => {
  return callApi('/reset_password', 'post', form);
};

const getMe = () => {
  return callApi(`/${CONFIG.API_VERSION}/auth/me`, 'get');
};

const createUser = (form: CreateUser) => {
  return callApi(`/${CONFIG.API_VERSION}/auth`, 'post', form);
};

const updateUser = (form: UpdateUserDto) => {
  return callApi(`/${CONFIG.API_VERSION}/users/update`, 'post', form);
};

const deactivateSession = (sessionId: string, userId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/auth/deactivate-session/${userId}/${sessionId}`, 'get');
};

export const auth = {
  login,
  resetPassword,
  getMe,
  updateUser,
  logout,
  createUser,
  deactivateSession,
  register,
};
