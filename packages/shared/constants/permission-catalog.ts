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
    'order.log.view',
  ],

  [RoleType.Designer]: [
    'page.dashboard', 'page.orders',
    'order.view_workshop_table',
    'order.field.toolResult.view',     'order.field.toolResult.edit',
    'order.field.toolResultNote.view', 'order.field.toolResultNote.edit',
    'order.field.errorFile.view',      'order.field.errorFile.edit',
    'order.field.errorFileNote.view',  'order.field.errorFileNote.edit',
    'order.field.assignee.view',       'order.field.assignee.edit',
    'order.field.assigneeNote.view',   'order.field.assigneeNote.edit',
    'order.field.fabricType.view',
  ],

  [RoleType.Fulfillment]: [
    'page.dashboard', 'page.orders',
    'order.view_workshop_table',
    'order.field.printStatus.view',     'order.field.printStatus.edit',
    'order.field.printStatusNote.view', 'order.field.printStatusNote.edit',
    // Fulfillment cần đọc + sửa Note kết quả Tool để cập nhật tình trạng đơn
    // sau khi in.
    'order.field.toolResultNote.view', 'order.field.toolResultNote.edit',
    'order.field.fabricType.view',
  ],
};

/** Roles seeded with their default permissions. Order matters for UI tabs. */
export const SYSTEM_ROLES: RoleType[] = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.Support,
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
