import type {
  CreateDesignerTeamMemberDto,
  DesignerBulkTransitionDto,
  DesignerTransitionDto,
  ResetDesignerPasswordDto,
  UpdateDesignerTeamMemberDto,
} from 'shared';
import { callApi } from '../apis';
import { CONFIG } from '../constants';

const listTeam = (status?: string) => {
  const qs = status ? `?status=${status}` : '';
  return callApi(`/${CONFIG.API_VERSION}/designer/team${qs}`, 'get');
};

const createMember = (data: CreateDesignerTeamMemberDto) => {
  return callApi(`/${CONFIG.API_VERSION}/designer/team`, 'post', data);
};

const updateMember = (userId: string, data: UpdateDesignerTeamMemberDto) => {
  return callApi(`/${CONFIG.API_VERSION}/designer/team/${userId}`, 'patch', data);
};

const removeMember = (userId: string) => {
  return callApi(`/${CONFIG.API_VERSION}/designer/team/${userId}`, 'delete');
};

const resetPassword = (userId: string, data: ResetDesignerPasswordDto) => {
  return callApi(`/${CONFIG.API_VERSION}/designer/team/${userId}/reset-password`, 'post', data);
};

const migrateLeader = () => {
  return callApi(`/${CONFIG.API_VERSION}/designer/migrate-leader`, 'post');
};

// ─── Phase 3 transition + Phase 4 my-tasks/my-stats ────────────────────

const transition = (orderId: string, data: DesignerTransitionDto) => {
  return callApi(
    `/${CONFIG.API_VERSION}/orders/${orderId}/designer-transition`,
    'post',
    data,
  );
};

const myTasks = (
  params: {
    from?: string;
    to?: string;
    type?: string;
    fabricType?: string;
    machineNumber?: string;
    toolResult?: string;
    toolResultNote?: string;
    userSku?: string;
    search?: string;
  } = {},
) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, String(v));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return callApi(`/${CONFIG.API_VERSION}/designer/my-tasks${suffix}`, 'get');
};

const myTaskFilters = (
  params: {
    from?: string;
    to?: string;
    type?: string;
    fabricType?: string;
    machineNumber?: string;
    toolResult?: string;
    toolResultNote?: string;
    userSku?: string;
  } = {},
) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, String(v));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return callApi(`/${CONFIG.API_VERSION}/designer/my-task-filters${suffix}`, 'get');
};

const bulkTransition = (data: DesignerBulkTransitionDto) => {
  return callApi(`/${CONFIG.API_VERSION}/designer/bulk-transition`, 'post', data);
};

const getOrderById = (id: string) => {
  return callApi(`/${CONFIG.API_VERSION}/orders/${id}`, 'get');
};

const myStats = (params: { period?: string; from?: string; to?: string } = {}) => {
  const qs = new URLSearchParams();
  qs.set('period', params.period || 'today');
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return callApi(`/${CONFIG.API_VERSION}/designer/my-stats?${qs.toString()}`, 'get');
};

const backfillDesignerStatus = () => {
  return callApi(`/${CONFIG.API_VERSION}/orders/backfill-designer-status`, 'post');
};

// ─── Phase 5 stats ──────────────────────────────────────────────────────

const performance = (params: { from?: string; to?: string; userId?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.userId) qs.set('userId', params.userId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return callApi(`/${CONFIG.API_VERSION}/designer/performance${suffix}`, 'get');
};

const timeline = (userId: string, params: { from?: string; to?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return callApi(
    `/${CONFIG.API_VERSION}/designer/timeline/${userId}${suffix}`,
    'get',
  );
};

const errorStats = (params: { from?: string; to?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return callApi(`/${CONFIG.API_VERSION}/orders/error-stats${suffix}`, 'get');
};

export const designer = {
  listTeam,
  createMember,
  updateMember,
  removeMember,
  resetPassword,
  migrateLeader,
  transition,
  myTasks,
  myTaskFilters,
  bulkTransition,
  getOrderById,
  myStats,
  backfillDesignerStatus,
  performance,
  timeline,
  errorStats,
};
