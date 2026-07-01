export const PRODUCT_LEVEL_MIN = 1;
export const PRODUCT_LEVEL_MAX = 10;

export interface ProductLevelMeta {
  value: number;
  label: string;
  /** Hex color cho badge — gradient dễ→khó (xanh lá → đỏ đậm). */
  color: string;
}

/** 10 cấp độ sản phẩm cố định. Product config chọn 1 giá trị; UI hiển thị badge màu. */
export const PRODUCT_LEVELS: ProductLevelMeta[] = [
  { value: 1, label: 'Level 1', color: '#22C55E' },
  { value: 2, label: 'Level 2', color: '#4ADE80' },
  { value: 3, label: 'Level 3', color: '#84CC16' },
  { value: 4, label: 'Level 4', color: '#EAB308' },
  { value: 5, label: 'Level 5', color: '#F59E0B' },
  { value: 6, label: 'Level 6', color: '#F97316' },
  { value: 7, label: 'Level 7', color: '#EF4444' },
  { value: 8, label: 'Level 8', color: '#DC2626' },
  { value: 9, label: 'Level 9', color: '#B91C1C' },
  { value: 10, label: 'Level 10', color: '#7F1D1D' },
];

export const PRODUCT_LEVEL_MAP: Record<number, ProductLevelMeta> = Object.fromEntries(
  PRODUCT_LEVELS.map((l) => [l.value, l]),
);
