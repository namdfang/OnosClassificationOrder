import type { CreateFactoryDto, UpdateFactoryDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getFactories = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/factories${query}`, 'get');
};

/**
 * Danh sách xưởng rút gọn cho MỌI tài khoản nhân viên (sidebar cụm xưởng,
 * select xưởng ở trang mà Fulfillment/Designer vào được). `getFactories` ở trên
 * là route CRUD, chỉ Admin/Manager/Support gọi được.
 */
const getFactoryOptions = () => {
  return callApi(`/${CONFIG.API_VERSION}/factories/options`, 'get');
};

const createFactory = (data: CreateFactoryDto) => {
  return callApi(`/${CONFIG.API_VERSION}/factories`, 'post', data);
};

const updateFactory = (id: string, data: UpdateFactoryDto) => {
  return callApi(`/${CONFIG.API_VERSION}/factories/${id}`, 'patch', data);
};

export const factory = { getFactories, getFactoryOptions, createFactory, updateFactory };
