import type { CreateMachineTypeDto, UpdateMachineTypeDto } from 'shared';
import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getMachineTypes = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/machine-types${query}`, 'get');
};

const createMachineType = (data: CreateMachineTypeDto) => {
  return callApi(`/${CONFIG.API_VERSION}/machine-types`, 'post', data);
};

const updateMachineType = (id: string, data: UpdateMachineTypeDto) => {
  return callApi(`/${CONFIG.API_VERSION}/machine-types/${id}`, 'patch', data);
};

export const machineType = { getMachineTypes, createMachineType, updateMachineType };
