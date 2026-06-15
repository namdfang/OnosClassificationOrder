import { useMemo } from 'react';

import { useAuthStore } from '@/store/authStore';

/**
 * Reads `profile.role.permissionCodes` and exposes lookup helpers used by:
 *  - sidebar menu filter
 *  - OrderTableWorkshop column visibility
 *  - inline cell read-only vs editable
 *
 * SuperAdmin / Admin role name bypasses the check so legacy tokens (no
 * permissionCodes seeded yet) still see everything.
 */
export function usePermission() {
  const profile = useAuthStore((s) => s.profile);

  const roleName = profile?.role?.name as string | undefined;
  const isAdmin = roleName === 'Admin' || roleName === 'SuperAdmin';

  const codes = useMemo(() => new Set<string>(profile?.role?.permissionCodes || []), [profile?.role?.permissionCodes]);

  return useMemo(() => {
    const has = (code: string) => isAdmin || codes.has(code);

    return {
      roleName,
      isAdmin,
      has,
      canViewField: (field: string) => has(`order.field.${field}.view`),
      canEditField: (field: string) => has(`order.field.${field}.edit`),
      canViewAdminTable: () => has('order.view_admin_table'),
      canViewWorkshopTable: () => has('order.view_workshop_table'),
    };
  }, [codes, isAdmin, roleName]);
}
