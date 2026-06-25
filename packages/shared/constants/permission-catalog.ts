import { RoleType } from '@shared/enums/role-type';

/**
 * Static permission catalog — single source of truth for both UI matrix and
 * backend authorization checks (`hasPermission(user, code)`).
 *
 * Codes use `domain.action` format. Field-level permissions further nest as
 * `domain.field.<field>.<view|edit>`.
 *
 * NOTE: This is a static catalog (Phase 5 lite). Phase 0 RBAC redesign will
 * fold this into a proper permission entity if needed; for now, role rows
 * carry a `permissionCodes: string[]` whitelist of these codes.
 */

export const PERMISSION_GROUPS = [
  'page',
  'order',
  'order_field',
  'workshop',
  'admin',
  'audit',
] as const;
export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

export type PermissionItem = {
  code: string;
  label: string;
  group: PermissionGroup;
  // Optional sub-grouping inside `order_field` (which field this perm controls)
  field?: string;
  mode?: 'view' | 'edit';
};

export const PERMISSION_CATALOG: PermissionItem[] = [
  // ─── Page access ────────────────────────────────────────────────
  { code: 'page.dashboard',       label: 'Truy cập Dashboard',           group: 'page' },
  { code: 'page.orders',          label: 'Truy cập Orders',              group: 'page' },
  { code: 'page.products',        label: 'Truy cập Products',            group: 'page' },
  { code: 'page.workshop_config', label: 'Truy cập Workshop Config',     group: 'page' },
  { code: 'page.users',           label: 'Truy cập User Management',     group: 'page' },
  { code: 'page.roles',           label: 'Truy cập Role Management',     group: 'page' },
  { code: 'page.designer_team',   label: 'Quản lý team designer (leader)', group: 'page' },
  { code: 'page.my_tasks',        label: 'Task của tôi (designer)',      group: 'page' },
  { code: 'page.designer_stats',  label: 'Stats designer (leader)',      group: 'page' },
  { code: 'page.fulfillment_my_tasks', label: 'Task của tôi (fulfillment worker)', group: 'page' },
  { code: 'page.fulfillment_team',     label: 'Quản lý team fulfillment',          group: 'page' },
  { code: 'page.fulfillment_stats',    label: 'Stats fulfillment',                 group: 'page' },

  // ─── Order actions ──────────────────────────────────────────────
  { code: 'order.import',              label: 'Import đơn hàng',           group: 'order' },
  { code: 'order.delete',              label: 'Xóa đơn hàng',              group: 'order' },
  { code: 'order.transfer',            label: 'Chuyển xưởng',              group: 'order' },
  { code: 'order.view_admin_table',    label: 'Thấy bảng Admin (cũ)',      group: 'order' },
  { code: 'order.view_workshop_table', label: 'Thấy bảng Workshop (mới)',  group: 'order' },

  // ─── Order field-level permissions ──────────────────────────────
  { code: 'order.field.printStatus.view',     label: 'Trạng thái in',         group: 'order_field', field: 'printStatus',     mode: 'view' },
  { code: 'order.field.printStatus.edit',     label: 'Trạng thái in',         group: 'order_field', field: 'printStatus',     mode: 'edit' },
  { code: 'order.field.printStatusNote.view', label: 'Note trạng thái in',    group: 'order_field', field: 'printStatusNote', mode: 'view' },
  { code: 'order.field.printStatusNote.edit', label: 'Note trạng thái in',    group: 'order_field', field: 'printStatusNote', mode: 'edit' },
  { code: 'order.field.toolResult.view',      label: 'Kết quả Tool',          group: 'order_field', field: 'toolResult',      mode: 'view' },
  { code: 'order.field.toolResult.edit',      label: 'Kết quả Tool',          group: 'order_field', field: 'toolResult',      mode: 'edit' },
  { code: 'order.field.toolResultNote.view',  label: 'Note kq Tool',          group: 'order_field', field: 'toolResultNote',  mode: 'view' },
  { code: 'order.field.toolResultNote.edit',  label: 'Note kq Tool',          group: 'order_field', field: 'toolResultNote',  mode: 'edit' },
  { code: 'order.field.errorFile.view',       label: 'File sửa lỗi',          group: 'order_field', field: 'errorFile',       mode: 'view' },
  { code: 'order.field.errorFile.edit',       label: 'File sửa lỗi',          group: 'order_field', field: 'errorFile',       mode: 'edit' },
  { code: 'order.field.errorFileNote.view',   label: 'Ghi chú file lỗi',      group: 'order_field', field: 'errorFileNote',   mode: 'view' },
  { code: 'order.field.errorFileNote.edit',   label: 'Ghi chú file lỗi',      group: 'order_field', field: 'errorFileNote',   mode: 'edit' },
  { code: 'order.field.assignee.view',        label: 'Người thực hiện',       group: 'order_field', field: 'assignee',        mode: 'view' },
  { code: 'order.field.assignee.edit',        label: 'Người thực hiện',       group: 'order_field', field: 'assignee',        mode: 'edit' },
  { code: 'order.field.assigneeNote.view',    label: 'Note người thực hiện',  group: 'order_field', field: 'assigneeNote',    mode: 'view' },
  { code: 'order.field.assigneeNote.edit',    label: 'Note người thực hiện',  group: 'order_field', field: 'assigneeNote',    mode: 'edit' },
  { code: 'order.field.fabricType.view',      label: 'Loại vải',              group: 'order_field', field: 'fabricType',      mode: 'view' },
  { code: 'order.field.fabricType.edit',      label: 'Loại vải',              group: 'order_field', field: 'fabricType',      mode: 'edit' },
  { code: 'order.field.machineNumber.view',   label: 'Máy',                   group: 'order_field', field: 'machineNumber',   mode: 'view' },
  { code: 'order.field.machineNumber.edit',   label: 'Máy',                   group: 'order_field', field: 'machineNumber',   mode: 'edit' },
  { code: 'order.field.productionError.view',     label: 'Lỗi xưởng',             group: 'order_field', field: 'productionError',     mode: 'view' },
  { code: 'order.field.productionError.edit',     label: 'Lỗi xưởng',             group: 'order_field', field: 'productionError',     mode: 'edit' },
  { code: 'order.field.productionErrorNote.view', label: 'Mô tả lỗi xưởng',       group: 'order_field', field: 'productionErrorNote', mode: 'view' },
  { code: 'order.field.productionErrorNote.edit', label: 'Mô tả lỗi xưởng',       group: 'order_field', field: 'productionErrorNote', mode: 'edit' },
  { code: 'order.field.productionErrorSource.view', label: 'Loại lỗi (des/xưởng)', group: 'order_field', field: 'productionErrorSource', mode: 'view' },
  { code: 'order.field.productionErrorSource.edit', label: 'Loại lỗi (des/xưởng)', group: 'order_field', field: 'productionErrorSource', mode: 'edit' },
  { code: 'order.field.designerStatus.view',      label: 'Trạng thái designer',   group: 'order_field', field: 'designerStatus',      mode: 'view' },

  // ─── Designer workflow ──────────────────────────────────────────
  { code: 'designer.team.manage',     label: 'Tạo/sửa/xoá sub-designer',                group: 'admin' },
  { code: 'designer.task.assign',     label: 'Assign task cho sub-designer',            group: 'order' },
  { code: 'designer.task.transition', label: 'Transition trạng thái task của bản thân', group: 'order' },
  { code: 'designer.task.override',   label: 'Override transition (leader/admin)',      group: 'order' },

  // ─── Fulfillment workflow ───────────────────────────────────────
  { code: 'fulfillment.task.transition', label: 'Transition stage của task bản thân',     group: 'order' },
  { code: 'fulfillment.task.override',   label: 'Override transition (manager/admin)',    group: 'order' },
  { code: 'fulfillment.team.manage',     label: 'Quản lý worker (factory × stage)',       group: 'admin' },

  // ─── Workshop config ────────────────────────────────────────────
  { code: 'workshop.manage', label: 'Quản lý danh mục xưởng', group: 'workshop' },

  // ─── Admin ──────────────────────────────────────────────────────
  { code: 'user.manage', label: 'Quản lý user',     group: 'admin' },
  { code: 'role.manage', label: 'Quản lý role + permission', group: 'admin' },

  // ─── Audit ──────────────────────────────────────────────────────
  { code: 'order.log.view', label: 'Xem log thay đổi đơn hàng', group: 'audit' },
];

export const ALL_PERMISSION_CODES = PERMISSION_CATALOG.map((p) => p.code);

/**
 * Default permission preset per system role. Used by RoleService seed +
 * resetPermissionsToDefault().
 */
export const DEFAULT_ROLE_PERMISSIONS: Partial<Record<RoleType, string[]>> = {
  [RoleType.SuperAdmin]: ALL_PERMISSION_CODES,
  [RoleType.Admin]: ALL_PERMISSION_CODES,

  [RoleType.Manager]: ALL_PERMISSION_CODES,

  [RoleType.Support]: [
    'page.dashboard', 'page.orders', 'page.products',
    'order.import', 'order.view_workshop_table',
    'order.field.printStatus.view',
    'order.field.printStatusNote.view',
    'order.field.toolResult.view',
    'order.field.toolResultNote.view',
    'order.field.errorFile.view',
    'order.field.errorFileNote.view',
    'order.field.assignee.view',
    'order.field.assigneeNote.view',
    'order.field.fabricType.view',
    'order.field.machineNumber.view',
    'order.field.productionError.view',
    'order.field.productionErrorNote.view',
    'order.log.view',
  ],

  // DesignerLeader — quản lý team + assign task + xem stats. Có toàn bộ quyền
  // order như Admin (trừ phần infra như user.manage / role.manage chung).
  [RoleType.DesignerLeader]: [
    'page.dashboard', 'page.orders',
    'page.designer_team', 'page.designer_stats', 'page.my_tasks',
    'page.workshop_config',
    'order.import', 'order.delete', 'order.transfer',
    'order.view_workshop_table',
    'order.field.printStatus.view',     'order.field.printStatus.edit',
    'order.field.printStatusNote.view', 'order.field.printStatusNote.edit',
    'order.field.toolResult.view',      'order.field.toolResult.edit',
    'order.field.toolResultNote.view',  'order.field.toolResultNote.edit',
    'order.field.errorFile.view',       'order.field.errorFile.edit',
    'order.field.errorFileNote.view',   'order.field.errorFileNote.edit',
    'order.field.assignee.view',        'order.field.assignee.edit',
    'order.field.assigneeNote.view',    'order.field.assigneeNote.edit',
    'order.field.fabricType.view',
    'order.field.machineNumber.view',   'order.field.machineNumber.edit',
    'order.field.productionError.view',
    'order.field.productionErrorNote.view',
    'order.field.productionErrorSource.view',
    'order.field.designerStatus.view',
    'designer.team.manage',
    'designer.task.assign',
    'designer.task.override',
    'order.log.view',
  ],

  // Designer (sub) — chỉ thấy task của mình, không sửa toolResultNote
  // (BE auto derive khi transition done), không assign cho ai khác.
  [RoleType.Designer]: [
    'page.dashboard', 'page.orders', 'page.my_tasks',
    'order.view_workshop_table',
    'order.field.toolResult.view',     'order.field.toolResult.edit',
    'order.field.toolResultNote.view', // VIEW only — BE derive khi done
    'order.field.errorFile.view',      'order.field.errorFile.edit',
    'order.field.errorFileNote.view',  'order.field.errorFileNote.edit',
    'order.field.assignee.view',       // VIEW only — Leader assign
    'order.field.assigneeNote.view',   'order.field.assigneeNote.edit',
    'order.field.fabricType.view',
    'order.field.machineNumber.view',
    'order.field.productionError.view',
    'order.field.productionErrorNote.view',
    'order.field.designerStatus.view',
    'designer.task.transition',
  ],

  [RoleType.Fulfillment]: [
    'page.dashboard', 'page.orders',
    'page.fulfillment_my_tasks',
    'order.view_workshop_table',
    'order.field.printStatus.view',     'order.field.printStatus.edit',
    'order.field.printStatusNote.view', 'order.field.printStatusNote.edit',
    // Fulfillment chỉ XEM Note kq Tool 1 (Designer là người sửa). Tình trạng
    // sau in báo qua productionError thay vì toolResultNote.
    'order.field.toolResultNote.view',
    'order.field.fabricType.view',
    'order.field.machineNumber.view',       'order.field.machineNumber.edit',
    // Fulfillment báo lỗi xưởng + mô tả lỗi + loại lỗi.
    'order.field.productionError.view',     'order.field.productionError.edit',
    'order.field.productionErrorNote.view', 'order.field.productionErrorNote.edit',
    'order.field.productionErrorSource.view', 'order.field.productionErrorSource.edit',
    // 5-stage workflow transitions on own task.
    'fulfillment.task.transition',
  ],
};

/** Roles seeded with their default permissions. Order matters for UI tabs. */
export const SYSTEM_ROLES: RoleType[] = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.Support,
  RoleType.DesignerLeader,
  RoleType.Designer,
  RoleType.Fulfillment,
];

export function isSystemRole(name: RoleType): boolean {
  return SYSTEM_ROLES.includes(name);
}

/** Whether the given permission code is in user's whitelist. */
export function hasPermissionCode(userPermissionCodes: string[] | undefined, code: string): boolean {
  if (!userPermissionCodes || userPermissionCodes.length === 0) return false;
  return userPermissionCodes.includes(code);
}
