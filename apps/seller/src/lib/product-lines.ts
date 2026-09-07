import type { LucideIcon } from 'lucide-react';
import { Image, Layers, Lightbulb, Scissors, Shirt, TreePine } from 'lucide-react';
import { PRODUCT_LINES, ProductLine } from 'shared/enums';

/** Màu + icon từng dòng sản phẩm — pattern `SERVICE_COLORS/ICONS` của thghub. */
export const PRODUCT_LINE_META: Record<ProductLine, { color: string; icon: LucideIcon; slug: string }> = {
  [ProductLine.ThreeD]: { color: '#4338ca', icon: Shirt, slug: '3d' },
  [ProductLine.TwoD]: { color: '#0e7490', icon: Layers, slug: '2d' },
  [ProductLine.Wood]: { color: '#92400e', icon: TreePine, slug: 'wood' },
  [ProductLine.Embroidery]: { color: '#7c3aed', icon: Scissors, slug: 'embroidery' },
  [ProductLine.Led]: { color: '#b45309', icon: Lightbulb, slug: 'led' },
  [ProductLine.Canvas]: { color: '#047857', icon: Image, slug: 'canvas' },
};

export { PRODUCT_LINES, ProductLine };

export function isProductLine(v: string | null | undefined): v is ProductLine {
  return !!v && (PRODUCT_LINES as readonly string[]).includes(v);
}

export function productLineColor(line?: string | null): string {
  return isProductLine(line) ? PRODUCT_LINE_META[line].color : '#6b7280';
}

/** Route con `/portal/orders/<slug>` của từng dòng. */
export function productLineHref(line: ProductLine): string {
  return `/portal/orders/${PRODUCT_LINE_META[line].slug}`;
}
