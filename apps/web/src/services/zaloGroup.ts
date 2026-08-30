import type { ToggleZaloSummaryTaskDto, UpdateZaloGroupLinkDto, UpdateZaloIdentityDto } from 'shared';

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

const getSummaries = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-groups/summaries${query}`, 'get');
};

const toggleTask = (groupGlobalId: string, data: ToggleZaloSummaryTaskDto) => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-groups/summaries/${groupGlobalId}/task`, 'patch', data);
};

const getIdentities = (query: string = '') => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-groups/identities${query}`, 'get');
};

const getIdentityCounts = () => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-groups/identities/counts`, 'get');
};

const updateIdentity = (zaloUid: string, data: UpdateZaloIdentityDto) => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-groups/identities/${zaloUid}`, 'patch', data);
};

const applyIdentitySuggestions = () => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-groups/identities/apply-suggestions`, 'post');
};

export const zaloGroup = {
  getIdentities,
  getIdentityCounts,
  updateIdentity,
  applyIdentitySuggestions, getGroups, getCoverage, getSuggestions, updateLink, getSummaries, toggleTask };
