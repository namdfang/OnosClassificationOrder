export const PATHS = {
  HOME: '/dashboard',
  SETTINGS: '/settings',

  ACCOUNT: '/account',

  PRODUCTS: '/products',
  ORDERS: '/orders',
  ORDERS_SCAN_ERROR: '/orders/scan-error',
  WORKSHOP_CONFIG: '/workshop-config',

  USERS: '/users',
  DEPARTMENTS: '/departments',
  ROLES: '/roles',
  CUSTOM_ROLES: '/custom-roles',

  // Designer Task Workflow (Phase 2+)
  DESIGNER_TEAM: '/designer/team',
  MY_TASKS: '/my-tasks',
  DESIGNER_STATS: '/designer/stats',

  // Fulfillment 5-stage Workflow
  FULFILLMENT_MY_TASKS: '/fulfillment/my-tasks',
  FULFILLMENT_TEAM: '/fulfillment/team',
  FULFILLMENT_STATS: '/fulfillment/stats',

  NOTIFICATIONS: '/notifications',

  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  ERROR_403: '/forbidden',
  ERROR_404: '/error/404',
  ANY: '*',
} as const;
