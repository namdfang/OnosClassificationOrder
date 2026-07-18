import axios, { HttpStatusCode } from 'axios';
import { toast } from 'sonner';

import { PATHS } from '@/constants/paths';

import { useAuthStore } from '@/store/authStore';

import { CONFIG } from '../constants';

const PUBLIC_ROUTE_KEYWORDS = ['catalog', 'product', 'products', 'categories', 'providers'];

const apiAxios = axios.create({
  baseURL: CONFIG.API_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiAxios.interceptors.request.use(
  (config) => {
    const url = config.url || '';
    const isPublicRoute = PUBLIC_ROUTE_KEYWORDS.some((kw) => url.includes(kw));
    const token = useAuthStore.getState().getToken(isPublicRoute);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === HttpStatusCode.Unauthorized) {
      useAuthStore.getState().clearToken();
    }

    if (error?.response?.status === 405) {
      window.location.href = PATHS.ACCOUNT;
      return Promise.reject(new Error('You need to change password'));
    }

    // Token còn hạn nhưng user đã bị xoá/không tồn tại (JwtStrategy.validate
    // ném UserNotFoundException) — đẩy logout thay vì chỉ hiện raw i18n key.
    // Loại trừ chính request /auth/login: backend dùng chung message này cho
    // cả sai mật khẩu/user inactive khi đăng nhập — không phải phiên bị mất,
    // để trang login tự hiện lỗi thay vì bị logout/redirect ngay trên chính nó.
    const isLoginRequest = (error?.config?.url as string | undefined)?.includes('/auth/login');
    if (!isLoginRequest && error?.response?.data?.message === 'error.userNotFound') {
      toast.error('Tài khoản không tồn tại hoặc đã bị xoá. Vui lòng đăng nhập lại.');
      useAuthStore.getState().clearToken();
      error.__silent = true;
    }

    return Promise.reject(error);
  },
);

export const callApi = (endPoint: string, method: string, body?: any, type?: string) => {
  return apiAxios({
    method,
    url: endPoint,
    data: body,
    headers: type === 'upload' ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
};

export const callBlobApi = (endPoint: string, url: string, fileName: string) => {
  const isPublicRoute =
    endPoint.includes('catalog') ||
    endPoint.includes('product') ||
    endPoint.includes('products') ||
    endPoint.includes('categories');
  endPoint.includes('providers');

  const token = useAuthStore.getState().getToken(isPublicRoute);

  return axios({
    url,
    method: 'GET',
    responseType: 'blob',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).then((response) => {
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  });
};
