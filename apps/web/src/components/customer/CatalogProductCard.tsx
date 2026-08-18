import React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon } from 'lucide-react';
import type { CustomerCatalogItem } from 'shared';

import { Badge } from '@/components/ui/badge';

import { cn } from '@/utils/cn';

import { useImageFallback } from '@/hooks/useImageFallback';

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
 *
 * **Chuỗi dự phòng 3 bậc** (`Catalog.md` §5.1): `mockupLarge` (ảnh gốc full-size,
 * đủ nét cho ô ~300px) → hỏng thì `mockup` (thumbnail `-100x100` đang lưu) →
 * hỏng nốt thì icon mặc định. Bậc giữa là thứ giữ cho sản phẩm không tụt từ
 * "ảnh mờ" xuống "không có ảnh" khi ảnh gốc đã bị xóa khỏi onospod.
 */
export function CatalogProductCard({ item, onSelect, className }: CatalogProductCardProps) {
  const { t } = useTranslation('customerPortal');
  const { src: imageSrc, onError: onImageError } = useImageFallback([item.mockupLarge, item.mockup]);
  const cheapest = item.variations.reduce<CustomerCatalogItem['variations'][number] | undefined>((min, v) => {
    const price = v.discountedPrice ?? v.retailPrice ?? Infinity;
    const minPrice = min ? min.discountedPrice ?? min.retailPrice ?? Infinity : Infinity;
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
        {imageSrc ? (
          <img
            // `key` theo URL → mỗi bậc dự phòng là một phần tử <img> mới, thay vì
            // dựa vào việc trình duyệt bắn lại `error` trên đúng thẻ vừa hỏng.
            key={imageSrc}
            src={imageSrc}
            alt={item.fullName}
            className="w-full h-full object-contain transition-transform group-hover:scale-105"
            loading="lazy"
            decoding="async"
            onError={onImageError}
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
            <span className="text-sm font-semibold text-primary">
              {formatPrice(cheapest?.discountedPrice ?? cheapest?.retailPrice)}
            </span>
            {hasDiscount && (
              <span className="text-[11px] line-through text-muted-foreground">
                {formatPrice(cheapest?.retailPrice)}
              </span>
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
