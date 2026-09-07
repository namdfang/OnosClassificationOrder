/**
 * Token màu dùng qua CSS variable (đổi theme tự chảy theo). Các mã hex bên dưới là màu
 * NGỮ NGHĨA (theme-agnostic) dùng kèm alpha `color + "15"` như khuôn thghub.
 */
export const COLORS = {
  bg: 'var(--color-background)',
  card: 'var(--color-card)',
  sidebar: 'var(--color-sidebar)',
  border1: 'var(--color-border1)',
  border2: 'var(--color-border2)',
  text1: 'var(--color-text-primary)',
  text2: 'var(--color-text-secondary)',
  text3: 'var(--color-text-muted)',
  accent: 'var(--color-accent)',
  accentLight: 'var(--color-accent-light)',
  green: '#15803d',
  red: '#b91c1c',
  orange: '#c2410c',
  yellow: '#a16207',
  purple: '#7c3aed',
  cyan: '#0891b2',
  pink: '#be185d',
} as const;

/**
 * Màu theo `CustomerOrderStatus` (shared/enums) — key là GIÁ TRỊ enum (`in-production`…),
 * dùng cho pill/badge trạng thái. Held/Rework là cờ chồng (không phải trạng thái).
 */
export const STATUS_COLORS: Record<string, string> = {
  pending: '#9a7a05',
  processing: '#7f9a2b',
  'in-production': '#c40c68',
  fulfilled: '#48a05c',
  completed: '#2f7a40',
  refunded: '#800808',
  cancelled: '#6b7280',
  held: '#e01008',
  rework: '#9a7a05',
};

/** Màu badge loại sản phẩm tự do (fallback khi không có dòng sản phẩm). */
export const TYPE_COLORS: Record<string, string> = {};
