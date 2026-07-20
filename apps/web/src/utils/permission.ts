import { RoleType } from 'shared';

import { useAuthStore } from '@/store/authStore';

export const validatePermission = (roles: string[]) => {
  if (roles.length === 0) return true;
  const roleName = useAuthStore.getState().profile?.role?.name;

  return !!roleName && roles.includes(roleName);
};

export const hasManagerPermission = () => {
  const roleName = useAuthStore.getState().profile?.role?.name;

  return (
    !!roleName &&
    (
      [RoleType.Admin, RoleType.Manager, RoleType.Accountant, RoleType.ProductManager, RoleType.Logistics] as string[]
    ).includes(roleName)
  );
};

export const hasSellerPermission = () => {
  const profile = useAuthStore.getState().profile;

  if (!profile) return false;
  if (profile?.role?.name === RoleType.Seller) return true;

  return false;
};
