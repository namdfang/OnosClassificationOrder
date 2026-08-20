import { useMemo } from 'react';
import { RoleType } from 'shared';

import { useAuthStore } from '@/store/authStore';

/**
 * AUTH-6 — ai được GHI dữ liệu ở trang Sản phẩm (`/adm/products`).
 *
 * Support có `page.products` nên vào được trang và (từ AUTH-6) đọc được dữ liệu,
 * nhưng mọi route ghi của product-config/factory/machine-type/product-category/
 * collection vẫn chỉ mở cho Admin + Manager. Hook này MIRROR đúng danh sách vai
 * đó để giao diện không mời người dùng bấm một nút chắc chắn trả 403.
 *
 * Đây CHỈ là lớp giao diện. Lớp chặn thật nằm ở `@Auth` của controller — sửa một
 * bên mà quên bên kia thì hoặc Support bấm được nút rồi ăn 403, hoặc tệ hơn là
 * ghi được thật. Đổi ở đây thì đổi cả ở đó.
 */
const PRODUCT_WRITE_ROLES: string[] = [RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager];

export function useProductWriteAccess() {
  const roleName = useAuthStore((s) => s.profile?.role?.name) as string | undefined;

  return useMemo(
    () => ({
      roleName,
      canWriteProducts: !!roleName && PRODUCT_WRITE_ROLES.includes(roleName),
    }),
    [roleName],
  );
}
