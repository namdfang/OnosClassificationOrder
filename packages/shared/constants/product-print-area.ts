import { z } from 'zod';

import { DesignFieldsZod } from '../dtos/production-order.dto';

/** 1 trong các key hợp lệ của `DesignFields` (order.designs) — xem `production-order.dto.ts`. */
export type ProductPrintAreaKey = keyof typeof DesignFieldsZod.shape;

/**
 * Toàn bộ vị trí in khả dĩ — CỐ ĐỊNH trong code (constant), map 1-1 với field
 * trong `DesignFields` (order.designs). Đóng vai trò danh mục để admin CHỌN
 * (KHÔNG tự gõ tay) khi cấu hình vị trí in cho từng sản phẩm — đảm bảo
 * `printArea` luôn trỏ đúng field design tồn tại, tránh sai chính tả / trỏ
 * tới field không có thật. Nếu `DesignFields` có key mới, TypeScript sẽ báo
 * lỗi ở object bên dưới cho tới khi thêm nhãn tương ứng (`Record` đủ key).
 */
const PRINT_AREA_LABELS: Record<ProductPrintAreaKey, string> = {
  front: 'Mặt trước',
  back: 'Mặt sau',
  sleeve: 'Tay áo',
  hood: 'Mũ trùm',
  folder: 'Nẹp gấp',
  placket: 'Nẹp áo',
  chestLeft: 'Ngực trái',
  chestRight: 'Ngực phải',
  left: 'Bên trái',
  right: 'Bên phải',
  sleeveLeft: 'Tay trái',
  sleeveRight: 'Tay phải',
  leftUpperSleeve: 'Bắp tay trái',
  rightUpperSleeve: 'Bắp tay phải',
  leftCuff: 'Cổ tay trái',
  rightCuff: 'Cổ tay phải',
  frontEmbroidery: 'Thêu mặt trước',
  backEmbroidery: 'Thêu mặt sau',
};

export const PRODUCT_PRINT_AREAS: { key: ProductPrintAreaKey; label: string }[] = Object.entries(
  PRINT_AREA_LABELS,
).map(([key, label]) => ({ key: key as ProductPrintAreaKey, label }));

export const PRODUCT_PRINT_AREA_KEYS = PRODUCT_PRINT_AREAS.map((p) => p.key) as [
  ProductPrintAreaKey,
  ...ProductPrintAreaKey[],
];

export const PRODUCT_PRINT_AREA_LABEL_MAP: Record<ProductPrintAreaKey, string> = PRINT_AREA_LABELS;

/** Zod validator — chỉ chấp nhận 1 trong các key cố định ở trên. */
export const ProductPrintAreaKeyZod = z.enum(PRODUCT_PRINT_AREA_KEYS);
