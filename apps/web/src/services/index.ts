import { auth } from './auth';
import { cache } from './cache';
import { collection } from './collection';
import { customRoles } from './custom-roles';
import { customer } from './customer';
import { customerAssignment } from './customerAssignment';
import { customerAuth, customerCatalog, customerOrder } from './customerPortal';
import { departments } from './departments';
import { designer } from './designer';
import { designerAssignment } from './designerAssignment';
import { factory } from './factory';
import { fulfillment } from './fulfillment';
import { machineType } from './machineType';
import { notifications } from './notifications';
import { order } from './order';
import { productCategory } from './productCategory';
import { productConfig } from './productConfig';
import { promotion } from './promotion';
import { reports } from './reports';
import { roles } from './roles';
import { upload } from './upload';
import { users } from './users';
import { workshopConfig } from './workshopConfig';

export const RepositoryRemote = {
  auth,
  roles,
  upload,
  users,
  cache,
  departments,
  notifications,
  customRoles,
  factory,
  machineType,
  productCategory,
  productConfig,
  collection,
  order,
  workshopConfig,
  designer,
  designerAssignment,
  customer,
  customerAssignment,
  customerAuth,
  customerOrder,
  customerCatalog,
  fulfillment,
  reports,
  promotion,
};
