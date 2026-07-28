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

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatUsd(value?: number): string {
  return value == null ? '—' : usdFormatter.format(value);
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

  const images = useMemo(() => {
    const list: string[] = [];
    if (item?.mockup) list.push(item.mockup);
    if (item?.sizeChartUrl) list.push(item.sizeChartUrl);
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
              {images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    'w-14 h-14 rounded-lg border overflow-hidden bg-muted shrink-0',
                    i === activeImage ? 'border-primary ring-1 ring-primary' : 'border-border',
                  )}
                >
                  <img src={src} alt={`${item.fullName} ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-w-0 aspect-square rounded-xl border border-border bg-white flex items-center justify-center overflow-hidden">
            {images[activeImage] ? (
              <img src={images[activeImage]} alt={item.fullName} className="w-full h-full object-contain" />
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
