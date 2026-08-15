import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home, ImageIcon, ShoppingCart } from 'lucide-react';
import type { CustomerCatalogItem } from 'shared';

import { PATHS } from '@/constants/paths';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { handleAxiosError } from '@/utils';
import { findMatchingVariation, groupAttributeOptions } from '@/utils/catalogVariant';
import { cn } from '@/utils/cn';

import { useImageFallback } from '@/hooks/useImageFallback';

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatUsd(value?: number): string {
  return value == null ? '—' : usdFormatter.format(value);
}

/** 1 ảnh trong gallery: URL ưu tiên + URL dự phòng (xem `GalleryImage`). */
interface GallerySource {
  /** Ảnh gốc full-size — `mockupLarge` với ảnh sản phẩm. */
  src?: string;
  /** Bậc dự phòng khi `src` hỏng — `mockup` (thumbnail) với ảnh sản phẩm. */
  fallback?: string;
}

interface GalleryImageProps {
  source: GallerySource;
  alt: string;
  className: string;
  /** Cỡ icon khi hết bậc dự phòng — ảnh chính lớn, thumbnail nhỏ. */
  iconSize: number;
}

/**
 * Ảnh gallery kèm **chuỗi dự phòng 3 bậc** `mockupLarge` → `mockup` → icon mặc
 * định (`Catalog.md` §5.1). Tách thành component riêng vì hook không gọi được
 * trong vòng lặp render strip thumbnail.
 *
 * Thumbnail dùng CÙNG chuỗi với ảnh chính chứ không cố ý tải bản nhỏ: trình
 * duyệt tái dùng ảnh đã tải nên không thêm request, đổi lại thumbnail không bao
 * giờ lệch bậc với ảnh chính đang xem.
 */
function GalleryImage({ source, alt, className, iconSize }: GalleryImageProps) {
  const { src, onError } = useImageFallback([source.src, source.fallback]);
  if (!src) {
    return <ImageIcon size={iconSize} className="text-muted-foreground" />;
  }
  return (
    // `key` theo URL → mỗi bậc dự phòng là một phần tử <img> mới, thay vì
    // dựa vào việc trình duyệt bắn lại `error` trên đúng thẻ vừa hỏng.
    <img key={src} src={src} alt={alt} className={className} decoding="async" onError={onError} />
  );
}

function CustomerCatalogDetail() {
  const { t } = useTranslation('customerPortal');
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<CustomerCatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.customerCatalog.getCatalogItem(id);
        const data: CustomerCatalogItem = res?.data?.data;
        setItem(data);
        const initial: Record<string, string> = {};
        for (const attr of data?.variations?.[0]?.attributes || []) initial[attr.label] = attr.value;
        setSelected(initial);
      } catch (error) {
        handleAxiosError(error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const attributeGroups = useMemo(() => groupAttributeOptions(item?.variations || []), [item]);
  const matched = useMemo(
    () => (item ? findMatchingVariation(item.variations, selected) ?? item.variations[0] : undefined),
    [item, selected],
  );

  // Mỗi ảnh là một CẶP (ưu tiên, dự phòng), không phải 1 URL: ảnh sản phẩm ưu
  // tiên `mockupLarge` và rơi về `mockup` khi ảnh gốc đã bị xóa khỏi onospod.
  // Bảng size chỉ có 1 URL nên không có bậc dự phòng.
  const images = useMemo<GallerySource[]>(() => {
    const list: GallerySource[] = [];
    if (item?.mockupLarge || item?.mockup) list.push({ src: item.mockupLarge, fallback: item.mockup });
    if (item?.sizeChartUrl) list.push({ src: item.sizeChartUrl });
    return list;
  }, [item]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ImageIcon size={32} className="mb-3" />
        <p className="text-sm">{t('catalogDetail.notFound')}</p>
        <Link to={PATHS.CUSTOMER_CATALOG} className="text-sm text-primary underline mt-2">
          {t('catalogDetail.backToCatalog')}
        </Link>
      </div>
    );
  }

  const price = matched?.discountedPrice ?? matched?.retailPrice;
  const hasDiscount = matched?.discountedPrice != null && matched.discountedPrice !== matched.retailPrice;

  const handleNewOrder = () => {
    navigate(PATHS.CUSTOMER_ORDER_NEW, {
      state: { fromCatalog: true, product: item, selectedAttrs: selected },
    });
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
        <Link to={PATHS.CUSTOMER_CATALOG} className="hover:text-foreground">
          <Home size={13} />
        </Link>
        <ChevronRight size={12} />
        <Link to={PATHS.CUSTOMER_CATALOG} className="hover:text-foreground">
          {t('catalogDetail.breadcrumbCatalog')}
        </Link>
        <ChevronRight size={12} />
        <span className="text-foreground truncate max-w-[50vw]">{item.fullName}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-8">
        {/* ── Gallery ─────────────────────────────────────── */}
        <div className="flex gap-3 min-w-0">
          {images.length > 1 && (
            <div className="flex flex-col gap-2 shrink-0">
              {images.map((source, i) => (
                <button
                  key={(source.src || source.fallback || '') + i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    'w-14 h-14 rounded-lg border overflow-hidden bg-muted shrink-0 flex items-center justify-center',
                    i === activeImage ? 'border-primary ring-1 ring-primary' : 'border-border',
                  )}
                >
                  <GalleryImage
                    source={source}
                    alt={`${item.fullName} ${i + 1}`}
                    className="w-full h-full object-cover"
                    iconSize={18}
                  />
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-w-0 aspect-square rounded-xl border border-border bg-white flex items-center justify-center overflow-hidden">
            {images[activeImage] ? (
              <GalleryImage
                source={images[activeImage]}
                alt={item.fullName}
                className="w-full h-full object-contain"
                iconSize={40}
              />
            ) : (
              <ImageIcon size={40} className="text-muted-foreground" />
            )}
          </div>
        </div>

        {/* ── Info panel ──────────────────────────────────── */}
        <div className="min-w-0">
          {item.productCategory && <p className="text-xs text-muted-foreground mb-1">{item.productCategory}</p>}
          <h1 className="text-xl font-semibold mb-3">{item.fullName}</h1>

          {item.printMethod && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <Badge>{item.printMethod}</Badge>
            </div>
          )}

          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-2xl font-bold text-primary">{formatUsd(price)}</span>
            {hasDiscount && matched?.retailPrice != null && (
              <span className="text-sm line-through text-muted-foreground">{formatUsd(matched.retailPrice)}</span>
            )}
          </div>

          {matched?.sku && (
            <p className="text-xs text-muted-foreground mb-3">
              <span className="font-medium text-foreground">{t('catalogDetail.sku')}:</span> {matched.sku}
            </p>
          )}

          <div className="space-y-3 mb-5">
            {attributeGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{group.label}</p>
                {group.values.length <= 1 ? (
                  <Badge variant="outline">{group.values[0]}</Badge>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {group.values.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSelected((prev) => ({ ...prev, [group.label]: value }))}
                        className={cn(
                          'h-8 min-w-9 px-2.5 rounded-md border text-xs font-medium transition-colors',
                          selected[group.label] === value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-input hover:bg-accent',
                        )}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {item.printArea && item.printArea.length > 0 && (
            <p className="text-xs text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{t('catalogDetail.printArea')}:</span>{' '}
              {item.printArea.map((a) => a.label).join(', ')}
            </p>
          )}

          {item.description && <p className="text-sm text-muted-foreground mb-5">{item.description}</p>}

          <Button className="w-full h-10 mb-2" onClick={handleNewOrder}>
            <ShoppingCart size={16} />
            {t('catalogDetail.newOrder')}
          </Button>

          {item.sizeChartUrl && (
            <a href={item.sizeChartUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full h-10">
                {t('catalogDetail.downloadSizeChart')}
              </Button>
            </a>
          )}

          <Link
            to={PATHS.CUSTOMER_CATALOG}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-4"
          >
            <ChevronLeft size={13} />
            {t('catalogDetail.backToCatalog')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default CustomerCatalogDetail;
