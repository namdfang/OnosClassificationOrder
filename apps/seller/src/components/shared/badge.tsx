'use client';

import { useTranslation } from 'react-i18next';
import { STATUS_COLORS, TYPE_COLORS } from '@/lib/constants';
import { PRODUCT_LINE_META, isProductLine } from '@/lib/product-lines';

interface BadgeProps {
  children: React.ReactNode;
  bg: string;
  color: string;
  className?: string;
  title?: string;
}

export function Badge({ children, bg, color, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${className || ''}`}
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}

/** Badge trạng thái đơn khách (`CustomerOrderStatus`) — nhãn theo i18n `customerPortal.orders.status.*`. */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('customerPortal');
  const color = STATUS_COLORS[status] || '#6b7280';
  return (
    <Badge bg={color + '15'} color={color}>
      {t(`orders.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

/** Badge dòng sản phẩm — icon + màu từ `PRODUCT_LINE_META`, nhãn i18n `productLines.*`. */
export function ProductLineBadge({ line, compact }: { line?: string | null; compact?: boolean }) {
  const { t } = useTranslation('customerPortal');
  if (!isProductLine(line)) return null;
  const meta = PRODUCT_LINE_META[line];
  const Icon = meta.icon;
  return (
    <Badge bg={meta.color + '14'} color={meta.color} title={t(`productLines.${line}`)}>
      <Icon size={11} />
      {!compact && t(`productLines.${line}`)}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] || '#4b5563';
  return (
    <Badge bg={color + '12'} color={color}>
      {type}
    </Badge>
  );
}
