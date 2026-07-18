import { lazy } from 'react';

import { PATHS } from './paths';

const Home = lazy(() => import('../pages/home'));
const Settings = lazy(() => import('../pages/settings'));
const Account = lazy(() => import('../pages/account'));
const Products = lazy(() => import('../pages/products'));
const Orders = lazy(() => import('../pages/orders'));
const OrdersWorkshop = lazy(() => import('../pages/orders/workshop'));
const OrdersErrorLog = lazy(() => import('../pages/orders/error-log'));
const OrdersImport = lazy(() => import('../pages/orders/import'));
const OrdersCuttingFiles = lazy(() => import('../pages/orders/cutting-files'));
const OrdersScanError = lazy(() => import('../pages/orders/scan-error'));
const WorkshopConfig = lazy(() => import('../pages/workshop-config'));
const Users = lazy(() => import('../pages/users'));
const Departments = lazy(() => import('../pages/departments'));
const Roles = lazy(() => import('../pages/roles'));
const CustomRoles = lazy(() => import('../pages/custom-roles'));
const Notifications = lazy(() => import('../pages/notifications'));
const DesignerTeam = lazy(() => import('../pages/designer/team'));
const MyTasks = lazy(() => import('../pages/designer/my-tasks'));
const FulfillmentMyTasks = lazy(() => import('../pages/fulfillment/my-tasks'));

type RouterConfig = {
  path: (typeof PATHS)[keyof typeof PATHS];
  component: React.ElementType;
};

export const routerConfig: RouterConfig[] = [
  { path: PATHS.HOME, component: Home },
  { path: PATHS.SETTINGS, component: Settings },
  { path: PATHS.ACCOUNT, component: Account },
  { path: PATHS.PRODUCTS, component: Products },
  { path: PATHS.ORDERS, component: Orders },
  { path: PATHS.ORDERS_WORKSHOP, component: OrdersWorkshop },
  { path: PATHS.ORDERS_ERROR_LOG, component: OrdersErrorLog },
  { path: PATHS.ORDERS_IMPORT, component: OrdersImport },
  { path: PATHS.ORDERS_CUTTING_FILES, component: OrdersCuttingFiles },
  { path: PATHS.ORDERS_SCAN_ERROR, component: OrdersScanError },
  { path: PATHS.WORKSHOP_CONFIG, component: WorkshopConfig },
  { path: PATHS.USERS, component: Users },
  { path: PATHS.DEPARTMENTS, component: Departments },
  { path: PATHS.ROLES, component: Roles },
  { path: PATHS.CUSTOM_ROLES, component: CustomRoles },
  { path: PATHS.NOTIFICATIONS, component: Notifications },
  { path: PATHS.DESIGNER_TEAM, component: DesignerTeam },
  { path: PATHS.MY_TASKS, component: MyTasks },
  { path: PATHS.FULFILLMENT_MY_TASKS, component: FulfillmentMyTasks },
];
