'use client';

import { useTranslation } from 'react-i18next';
import { Image as ImageIcon } from 'lucide-react';
import type { CustomerCatalogItem } from 'shared';
import { ProductLineBadge } from '@/components/shared/badge';
import { SafeImage } from '@/components/shared/safe-image';
import { fmtUSD } from '@/lib/utils';

interface CatalogProductCardProps {
  item: CustomerCatalogItem;
  onSelect: () => void;
}

/** Mirror `apps/web/src/components/customer/CatalogProductCard.tsx` — dự phòng ảnh `mockupLarge` → `mockup` → icon (Catalog.md §5.1). */
export function CatalogProductCard({ item, onSelect }: CatalogProductCardProps) {
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
      className="group text-left bg-card border border-border1 rounded-xl overflow-hidden transition-all hover:border-accent hover:shadow-card hover:-translate-y-0.5"
    >
      <div className="aspect-square bg-surface-muted flex items-center justify-center overflow-hidden">
        <SafeImage
          src={item.mockupLarge ?? item.mockup}
          alt={item.fullName}
          className="w-full h-full object-contain transition-transform group-hover:scale-105"
          fallback={
            <SafeImage
              src={item.mockup}
              alt={item.fullName}
              className="w-full h-full object-contain"
              fallback={<ImageIcon size={26} className="text-text-muted" />}
            />
          }
        />
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.productCategory && (
            <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted truncate">{item.productCategory}</p>
          )}
          <ProductLineBadge line={item.productLine} compact />
        </div>
        <p className="text-xs font-medium text-text-primary line-clamp-2 leading-snug min-h-[2.5em]">{item.fullName}</p>
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-accent tabular-nums">{fmtUSD(cheapest?.discountedPrice ?? cheapest?.retailPrice)}</span>
            {hasDiscount && <span className="text-[10px] line-through text-text-muted tabular-nums">{fmtUSD(cheapest?.retailPrice)}</span>}
          </div>
          <span className="text-[10px] text-text-muted">{t('catalog.variationCount', { count: item.variations.length })}</span>
        </div>
      </div>
    </button>
  );
}
