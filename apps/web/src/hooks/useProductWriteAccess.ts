import { useMemo } from 'react';
import { RoleType } from 'shared';

import { useAuthStore } from '@/store/authStore';

/**
 * AUTH-6 — ai được GHI dữ liệu ở trang Sản phẩm (`/adm/products`).
 *
 * Từ 10/09/2026 quyền ghi tách 2 mức, MIRROR đúng `@Auth` của controller:
 * - `canWriteProducts` — TẠO + SỬA product config (GET :id / POST / PATCH :id /
 *   upload-image ở `product-config.controller.ts`): Admin + Manager + Support.
 * - `canManageProducts` — phần còn lại vẫn chỉ Admin + Manager: XÓA sản phẩm,
 *   6 nút công cụ import/crawl/backfill, và ghi 3 tab Xưởng/Danh mục/Collection
 *   (factory/machine-type/product-category/collection controllers).
 *
 * Đây CHỈ là lớp giao diện. Lớp chặn thật nằm ở `@Auth` của controller — sửa một
 * bên mà quên bên kia thì hoặc Support bấm được nút rồi ăn 403, hoặc tệ hơn là
 * ghi được thật. Đổi ở đây thì đổi cả ở đó.
 */
const PRODUCT_WRITE_ROLES: string[] = [RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager, RoleType.Support];
const PRODUCT_ADMIN_ROLES: string[] = [RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager];

export function useProductWriteAccess() {
  const roleName = useAuthStore((s) => s.profile?.role?.name) as string | undefined;

  return useMemo(
    () => ({
      roleName,
      canWriteProducts: !!roleName && PRODUCT_WRITE_ROLES.includes(roleName),
      canManageProducts: !!roleName && PRODUCT_ADMIN_ROLES.includes(roleName),
    }),
    [roleName],
  );
}
