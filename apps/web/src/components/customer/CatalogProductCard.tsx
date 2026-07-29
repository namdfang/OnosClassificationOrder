import React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon } from 'lucide-react';
import type { CustomerCatalogItem } from 'shared';

import { Badge } from '@/components/ui/badge';

import { cn } from '@/utils/cn';

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatPrice(value?: number): string {
  return value == null ? '—' : usdFormatter.format(value);
}

interface CatalogProductCardProps {
  item: CustomerCatalogItem;
  onSelect: () => void;
  className?: string;
}

/**
 * Card sản phẩm dùng chung cho trang Danh mục (`catalog/index.tsx`) VÀ bộ
 * chọn sản phẩm inline ở "Đặt đơn mới" (`orders/new.tsx`) — 1 nguồn cho giao
 * diện thẻ sản phẩm phía khách hàng, ảnh nổi bật trên đầu thay vì hàng ngang.
 */
export function CatalogProductCard({ item, onSelect, className }: CatalogProductCardProps) {
  const { t } = useTranslation('customerPortal');
  const cheapest = item.variations.reduce<CustomerCatalogItem['variations'][number] | undefined>((min, v) => {
    const price = v.discountedPrice ?? v.retailPrice ?? Infinity;
    const minPrice = min ? (min.discountedPrice ?? min.retailPrice ?? Infinity) : Infinity;
    return price < minPrice ? v : min;
  }, undefined);
  const hasDiscount = cheapest?.discountedPrice != null && cheapest.discountedPrice !== cheapest.retailPrice;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group text-left bg-card border border-border rounded-xl overflow-hidden transition-all',
        'hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5',
        className,
      )}
    >
      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {item.mockup ? (
          <img
            src={item.mockup}
            alt={item.fullName}
            className="w-full h-full object-contain transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <ImageIcon size={28} className="text-muted-foreground" />
        )}
      </div>

      <div className="p-3 space-y-1.5">
        {item.productCategory && (
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground truncate">
            {item.productCategory}
          </p>
        )}
        <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug min-h-[2.5em]">{item.fullName}</p>

        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-primary">{formatPrice(cheapest?.discountedPrice ?? cheapest?.retailPrice)}</span>
            {hasDiscount && (
              <span className="text-[11px] line-through text-muted-foreground">{formatPrice(cheapest?.retailPrice)}</span>
            )}
          </div>
          {item.variations.length > 1 && (
            <Badge variant="outline" className="text-[10px]">
              {t('catalog.variationCount', { count: item.variations.length })}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}
