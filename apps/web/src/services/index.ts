import { auth } from './auth';
import { roles } from './roles';
import { customRoles } from './custom-roles';
import { upload } from './upload';
import { users } from './users';
import { cache } from './cache';
import { departments } from './departments';
import { notifications } from './notifications';
import { factory } from './factory';
import { machineType } from './machineType';
import { productConfig } from './productConfig';
import { order } from './order';
import { workshopConfig } from './workshopConfig';
import { designer } from './designer';
import { fulfillment } from './fulfillment';
import { reports } from './reports';

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
  productConfig,
  order,
  workshopConfig,
  designer,
  fulfillment,
  reports,
};
