import { agentApi } from './agentApi';
import { auth } from './auth';
import { cache } from './cache';
import { collection } from './collection';
import { customRoles } from './custom-roles';
import { customer } from './customer';
import { customerAssignment } from './customerAssignment';
import { customerNotification } from './customerNotification';
import {
  customerApiAccess,
  customerAuth,
  customerCatalog,
  customerDesign,
  customerNotificationPortal,
  customerOrder,
} from './customerPortal';
import { departments } from './departments';
import { designer } from './designer';
import { designerAssignment } from './designerAssignment';
import { factory } from './factory';
import { fulfillment } from './fulfillment';
import { impersonate } from './impersonate';
import { machineType } from './machineType';
import { notifications } from './notifications';
import { order } from './order';
import { productCategory } from './productCategory';
import { productConfig } from './productConfig';
import { promotion } from './promotion';
import { publicCatalog } from './publicCatalog';
import { reports } from './reports';
import { roles } from './roles';
import { upload } from './upload';
import { users } from './users';
import { workshopConfig } from './workshopConfig';

export const RepositoryRemote = {
  agentApi,
  auth,
  roles,
  upload,
  users,
  cache,
  departments,
  notifications,
  customRoles,
  factory,
  impersonate,
  machineType,
  collection,
  productCategory,
  productConfig,
  order,
  workshopConfig,
  designer,
  designerAssignment,
  customer,
  customerAssignment,
  customerAuth,
  customerOrder,
  customerCatalog,
  customerDesign,
  customerApiAccess,
  publicCatalog,
  customerNotification,
  customerNotificationPortal,
  fulfillment,
  reports,
  promotion,
};
