'use client';

/**
 * `/portal/catalog/[id]` — chi tiết sản phẩm cho seller (SellerPortal.md §2.10).
 *
 * Trọng tâm là **bảng biến thể có SKU**: cột `sku` là thứ seller phải điền vào
 * file CSV import, trước đây không có chỗ nào tra được (phản hồi vận hành
 * 08/09/2026). Kèm nút chép nhanh từng SKU và tải CSV SKU của riêng sản phẩm này.
 *
 * Mirror `apps/web/src/pages/customer/catalog/detail.tsx`. Giá hiển thị là giá
 * bán đã áp khuyến mãi theo tier; giá vốn KHÔNG BAO GIỜ ra tới đây (Catalog.md).
 */

import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, ExternalLink, Image as ImageIcon, Loader2 } from 'lucide-react';
import type { CustomerCatalogItem } from 'shared';
import { ProductLineBadge } from '@/components/shared/badge';
import { Button } from '@/components/shared/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/card';
import { CopyButton } from '@/components/shared/copy-button';
import { PageHeader } from '@/components/shared/page-header';
import { SafeImage } from '@/components/shared/safe-image';
import { useApi } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';
import { isProductLine, productLineHref } from '@/lib/product-lines';
import { fmtUSD } from '@/lib/utils';
import { buildSkuCsv, saveCsv } from './sku-csv';

const TH = 'py-2 px-2 text-left text-[9px] text-text-muted font-semibold uppercase tracking-wider whitespace-nowrap';
const TD = 'py-2 px-2 text-[11px] text-text-primary';

export function CatalogDetailView({ id }: { id: string }) {
  const { t } = useTranslation(['seller', 'customerPortal']);
  const { data: res, loading } = useApi<ApiRes<CustomerCatalogItem>>(`/api/v1/customer/catalog/${encodeURIComponent(id)}`);
  const item = res?.data;
  const [active, setActive] = useState(0);

  if (loading && !item) return <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-accent" /></div>;
  if (!item) return <p className="text-xs text-text-muted py-16 text-center">{t('catalog.notFound', { ns: 'seller' })}</p>;

  const gallery = [item.mockupLarge ?? item.mockup, ...(item.images ?? []), item.sizeChartUrl].filter((x): x is string => !!x);
  const line = isProductLine(item.productLine ?? '') ? item.productLine : undefined;
  const requiredAreas = (item.printArea ?? []).filter((a) => a.isRequired !== false);

  return (
    <div className="space-y-3">
      <Link href="/portal/catalog" prefetch={false} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
        <ArrowLeft size={13} /> {t('catalog.backToCatalog', { ns: 'seller' })}
      </Link>

      <PageHeader
        title={item.fullName}
        subtitle={[item.productCategory, item.shortName, item.printMethod].filter(Boolean).join(' · ')}
        compact
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => saveCsv(buildSkuCsv([item]), `${item.shortName || 'sku'}.csv`)}>
              <Download size={13} /> {t('catalog.exportSku', { ns: 'seller' })}
            </Button>
            {line && (
              <Link href={`${productLineHref(line)}/create`} prefetch={false}>
                <Button size="sm">{t('catalog.orderNow', { ns: 'seller' })}</Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-1">
          <CardContent className="space-y-2">
            <div className="aspect-square bg-surface-muted rounded-lg overflow-hidden flex items-center justify-center">
              <SafeImage
                src={gallery[active]}
                alt={item.fullName}
                className="w-full h-full object-contain"
                fallback={<ImageIcon size={40} className="text-text-muted" strokeWidth={1.2} />}
              />
            </div>
            {gallery.length > 1 && (
              <div className="flex gap-1.5 flex-wrap">
                {gallery.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    onClick={() => setActive(i)}
                    className={`w-12 h-12 rounded-md overflow-hidden border ${i === active ? 'border-accent' : 'border-border1'}`}
                  >
                    <SafeImage src={src} alt="" className="w-full h-full object-cover" fallback={<ImageIcon size={14} className="text-text-muted" />} />
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {line && <ProductLineBadge line={line} />}
              {item.usImportTaxPerUnit != null && (
                <span className="text-[10px] text-text-secondary">
                  {t('catalog.importTax', { ns: 'seller' })}: <b className="tabular-nums">{fmtUSD(item.usImportTaxPerUnit)}</b>/{t('catalog.unit', { ns: 'seller' })}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 pt-1">
              {item.printTemplate && (
                <a href={item.printTemplate} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                  {t('catalog.template', { ns: 'seller' })} <ExternalLink size={10} />
                </a>
              )}
              {item.printDocument && item.printDocument !== item.printTemplate && (
                <a href={item.printDocument} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                  {t('catalog.printDocument', { ns: 'seller' })} <ExternalLink size={10} />
                </a>
              )}
              {item.sizeChartUrl && (
                <a href={item.sizeChartUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                  {t('catalog.sizeChart', { ns: 'seller' })} <ExternalLink size={10} />
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle>{t('catalog.variations', { ns: 'seller' })}</CardTitle>
              <span className="text-[10px] text-text-muted">{t('catalog.skuHint', { ns: 'seller' })}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[620px]">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className={TH}>{t('catalog.colSku', { ns: 'seller' })}</th>
                    <th className={TH}>{t('catalog.colVariation', { ns: 'seller' })}</th>
                    <th className={`${TH} text-right`}>{t('catalog.colPrice', { ns: 'seller' })}</th>
                    <th className={`${TH} text-right`}>{t('catalog.colShipCod', { ns: 'seller' })}</th>
                    <th className={`${TH} text-right`}>{t('catalog.colTiktok', { ns: 'seller' })}</th>
                    <th className={`${TH} text-right`}>{t('catalog.colWeight', { ns: 'seller' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {item.variations.map((v) => {
                    const price = v.discountedPrice ?? v.retailPrice;
                    const dims = [v.height, v.length, v.width].every((n) => n != null) ? `${v.height}×${v.length}×${v.width}cm` : null;
                    return (
                      <tr key={v.sku} className="border-b border-border2 last:border-0 hover:bg-card-hover">
                        <td className={TD}>
                          <span className="inline-flex items-center gap-1 font-mono font-bold">{v.sku}<CopyButton text={v.sku} size={10} /></span>
                        </td>
                        <td className={TD}>{(v.attributes ?? []).map((a) => `${a.label}: ${a.value}`).join(' / ') || '—'}</td>
                        <td className={`${TD} text-right tabular-nums font-semibold`}>
                          {price != null ? fmtUSD(price) : '—'}
                          {v.discountedPrice != null && v.retailPrice != null && v.discountedPrice !== v.retailPrice && (
                            <span className="ml-1 text-[10px] text-text-muted line-through">{fmtUSD(v.retailPrice)}</span>
                          )}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{v.shipCodPrice != null ? fmtUSD(v.shipCodPrice) : '—'}</td>
                        <td className={`${TD} text-right tabular-nums`}>{v.tiktokPrice != null ? fmtUSD(v.tiktokPrice) : '—'}</td>
                        <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
                          {v.weight != null ? `${v.weight}g` : '—'}
                          {dims && <span className="block text-[9.5px] text-text-muted">{dims}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {(requiredAreas.length > 0 || item.description || item.templateDescription) && (
        <Card>
          <CardHeader><CardTitle>{t('catalog.details', { ns: 'seller' })}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {requiredAreas.length > 0 && (
              <div>
                <p className="text-[10px] uppercase font-bold text-text-muted mb-1">{t('catalog.printAreas', { ns: 'seller' })}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(item.printArea ?? []).map((a) => (
                    <span key={a.key} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${a.isRequired !== false ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-card border-border1 text-text-secondary'}`}>
                      {a.label || a.key}{a.isRequired !== false ? ' *' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {item.description && (
              <div className="text-[11px] text-text-secondary leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: item.description }} />
            )}
            {item.templateDescription && (
              <div className="text-[11px] text-text-secondary leading-relaxed" dangerouslySetInnerHTML={{ __html: item.templateDescription }} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
