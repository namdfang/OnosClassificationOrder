import { RoleType } from 'shared';

type PermissionMap = {
  [key: string]: RoleType[];
};

export const permissionMap: PermissionMap = {
  '/dashboard': [],
  '/account': [],
  '/notifications': [],
  '/products': [RoleType.Admin, RoleType.Manager],
  '/orders': [RoleType.Admin, RoleType.Manager],
  '/users': [RoleType.Admin, RoleType.Manager],
  '/departments': [RoleType.Admin, RoleType.Manager],
  '/roles': [RoleType.Admin, RoleType.Manager],
  '/custom-roles': [RoleType.Admin, RoleType.Manager],
  '/settings': [RoleType.Admin, RoleType.Manager],
};
