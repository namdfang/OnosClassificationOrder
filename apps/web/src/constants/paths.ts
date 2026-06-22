export const PATHS = {
  HOME: '/dashboard',
  SETTINGS: '/settings',

  ACCOUNT: '/account',

  PRODUCTS: '/products',
  ORDERS: '/orders',
  WORKSHOP_CONFIG: '/workshop-config',

  USERS: '/users',
  DEPARTMENTS: '/departments',
  ROLES: '/roles',
  CUSTOM_ROLES: '/custom-roles',

  // Designer Task Workflow (Phase 2+)
  DESIGNER_TEAM: '/designer/team',
  MY_TASKS: '/my-tasks',
  DESIGNER_STATS: '/designer/stats',

  NOTIFICATIONS: '/notifications',

  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  ERROR_403: '/forbidden',
  ERROR_404: '/error/404',
  ANY: '*',
} as const;
