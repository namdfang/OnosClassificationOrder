import { RoleType } from 'shared';
import { useAuthStore } from '@/store/authStore';

// eslint-disable-next-line consistent-return
export const validatePermission = (roles: string[]) => {
  if (roles.length === 0) return true;
  const profile = useAuthStore.getState().profile;

  if (!profile) return false;
  if (roles.indexOf(profile?.role?.name) !== -1) return true;

  return false;
};

export const hasManagerPermission = () => {
  const profile = useAuthStore.getState().profile;

  if (!profile) return false;
  if (
    [RoleType.Admin, RoleType.Manager, RoleType.Accountant, RoleType.ProductManager, RoleType.Logistics].includes(
      profile?.role?.name,
    )
  )
    return true;

  return false;
};

export const hasSellerPermission = () => {
  const profile = useAuthStore.getState().profile;

  if (!profile) return false;
  if (profile?.role?.name === RoleType.Seller) return true;

  return false;
};
