export const ProductConfigStatus = {
  /** Hiển thị bình thường — hiện trong danh sách quản trị + catalog khách hàng. */
  Active: 'active',
  /** Không hiển thị cho khách hàng (catalog) — vẫn hiện trong danh sách quản trị. */
  Inactive: 'inactive',
  /** Ẩn khỏi danh sách quản trị + catalog khách hàng — KHÔNG xóa khỏi database (giữ liên kết dữ liệu). */
  Hidden: 'hidden',
} as const;
export type ProductConfigStatus = (typeof ProductConfigStatus)[keyof typeof ProductConfigStatus];
