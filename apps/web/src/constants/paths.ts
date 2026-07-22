export const PATHS = {
    // Trang chủ domain chính — public, không gate auth.
    LANDING: '/',

    // ---- Root router /ffm — các trang mang tính sản xuất ----
    HOME: '/ffm/dashboard',
    // `/ffm/orders` (bare) chỉ còn là redirect legacy — mọi trang thật nằm ở route
    // con riêng, điều hướng qua aside menu (KHÔNG dùng `?tab=` nữa).
    ORDERS: '/ffm/orders',
    ORDERS_WORKSHOP: '/ffm/orders/workshop',
    ORDERS_ERROR_LOG: '/ffm/orders/error-log',
    ORDERS_IMPORT: '/ffm/orders/import',
    ORDERS_CUTTING_FILES: '/ffm/orders/cutting-files',
    ORDERS_SCAN_ERROR: '/ffm/orders/scan-error',
    ORDERS_STAGE_ERRORS: '/ffm/orders/stage-errors',
    ORDERS_UNMAPPED: '/ffm/orders/unmapped',
    WORKSHOP_CONFIG: '/ffm/workshop-config',

    // Designer Task Workflow (Phase 2+)
    DESIGNER_TEAM: '/ffm/designer/team',
    MY_TASKS: '/ffm/my-tasks',
    DESIGNER_STATS: '/ffm/designer/stats',

    // Fulfillment 5-stage Workflow
    FULFILLMENT_MY_TASKS: '/ffm/fulfillment/my-tasks',
    FULFILLMENT_TEAM: '/ffm/fulfillment/team',
    FULFILLMENT_STATS: '/ffm/fulfillment/stats',

    // ---- Root router /adm — các trang dùng chung / quản trị ----
    SETTINGS: '/adm/settings',
    ACCOUNT: '/adm/account',
    PRODUCTS: '/adm/products',
    USERS: '/adm/users',
    DEPARTMENTS: '/adm/departments',
    ROLES: '/adm/roles',
    CUSTOM_ROLES: '/adm/custom-roles',
    NOTIFICATIONS: '/adm/notifications',

    LOGIN: '/adm/login',
    REGISTER: '/adm/register',
    FORGOT_PASSWORD: '/adm/forgot-password',

    // ---- Root router /customer — Customer Portal (khách hàng tự đặt đơn) ----
    CUSTOMER_LOGIN: '/customer/login',
    CUSTOMER_REGISTER: '/customer/register',
    CUSTOMER_ORDERS: '/customer/orders',
    CUSTOMER_ORDER_NEW: '/customer/orders/new',
    CUSTOMER_ORDER_DETAIL: '/customer/orders/:productionId',

    ERROR_403: '/forbidden',
    ERROR_404: '/error/404',
    ANY: '*',
} as const;
