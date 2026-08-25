/**
 * Nhận diện thuộc tính **size** và **màu** của biến thể sản phẩm
 * (`ProductConfig.variations[].attributes` — cặp label/value TỰ DO do admin đặt,
 * và dữ liệu thật rất tạp vì phần lớn đến từ import OnosPod).
 *
 * Đặt ở đây, KHÔNG chép sang FE hay BE: trang chi tiết sản phẩm (PRD-7) dùng nó
 * để dựng danh sách size cho bảng nhập kích thước in, còn API Design Review
 * (ORD-6) dùng nó để ghép kích thước + SKU biến thể cho đơn. Hai bên nhận diện
 * lệch nhau nghĩa là nhập được kích thước ở trang sản phẩm nhưng API trả rỗng —
 * sai hoàn toàn im lặng, không có lỗi nào báo ra.
 *
 * Luật chốt 2026-08-21 (PRD-7 §Business rule, thay ASSUMPTION cũ chỉ nhận "Size"):
 * dữ liệu thật có 159 sản phẩm dùng "Item Size" và chỉ 9 dùng "Size", nên nhận cả hai.
 */

/** Nhãn được coi là SIZE, xếp theo ĐỘ ƯU TIÊN — sản phẩm có cả hai thì lấy nhãn đứng trước. */
export const VARIATION_SIZE_LABELS = ['item size', 'size'] as const;

/** Nhãn được coi là MÀU. Không có ưu tiên: màu chỉ dùng để so khớp, không dựng danh sách. */
export const VARIATION_COLOR_LABELS = ['màu', 'mau', 'color', 'colour'] as const;

/** So khớp nhãn/giá trị thuộc tính: bỏ khoảng trắng thừa, không phân biệt hoa thường. */
export const normalizeVariationText = (value?: string | null): string => (value ?? '').trim().toLowerCase();

/** Hình dạng TỐI THIỂU cần để nhận diện — cố ý không import `ProductVariation` (dtos đã import file này). */
type VariationLike = { attributes?: { label: string; value: string }[] };

export const isVariationColorLabel = (label?: string | null): boolean =>
  (VARIATION_COLOR_LABELS as readonly string[]).includes(normalizeVariationText(label));

/**
 * Nhãn size mà sản phẩm này ĐANG dùng, hoặc `null` nếu không có biến thể nào mang
 * nhãn size. Có cả "Item Size" lẫn "Size" thì trả "item size" và nhãn còn lại bị
 * BỎ QUA — cố ý không gộp: gộp hai danh sách size của cùng một sản phẩm sinh ra
 * những size không có thật (VD "M" của bảng này lẫn với "M" của bảng kia).
 */
export const resolveVariationSizeLabel = (variations?: VariationLike[]): string | null => {
  const present = new Set<string>();
  for (const variation of variations ?? []) {
    for (const attribute of variation.attributes ?? []) present.add(normalizeVariationText(attribute.label));
  }
  return VARIATION_SIZE_LABELS.find((label) => present.has(label)) ?? null;
};

/**
 * Danh sách size của sản phẩm, lấy theo đúng nhãn `resolveVariationSizeLabel` chọn.
 *
 * GIỮ THỨ TỰ XUẤT HIỆN của biến thể, KHÔNG sort chữ cái: S/M/L/XL sort chữ cái ra
 * L/M/S/XL — vô nghĩa với người xưởng đang dò theo bảng size.
 */
export const collectVariationSizes = (variations?: VariationLike[]): string[] => {
  const sizeLabel = resolveVariationSizeLabel(variations);
  if (!sizeLabel) return [];
  const seen = new Map<string, string>();
  for (const variation of variations ?? []) {
    for (const attribute of variation.attributes ?? []) {
      if (normalizeVariationText(attribute.label) !== sizeLabel) continue;
      const value = (attribute.value ?? '').trim();
      const key = normalizeVariationText(value);
      if (value && !seen.has(key)) seen.set(key, value);
    }
  }
  return [...seen.values()];
};
