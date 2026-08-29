import type { UpdateZaloGroupLinkDto } from 'shared';

import { callApi } from '../apis';
import { CONFIG } from '../constants';

const getGroups = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-groups${query}`, 'get');
};

const getCoverage = () => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-groups/coverage`, 'get');
};

const getSuggestions = () => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-groups/suggestions`, 'get');
};

const updateLink = (id: string, data: UpdateZaloGroupLinkDto) => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-groups/${id}`, 'patch', data);
};

export const zaloGroup = { getGroups, getCoverage, getSuggestions, updateLink };
