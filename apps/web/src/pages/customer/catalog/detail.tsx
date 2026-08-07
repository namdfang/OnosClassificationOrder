import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { ChevronLeft, ChevronRight, Home, ImageIcon, ShoppingCart } from 'lucide-react';
import type { CustomerCatalogItem, CustomerCatalogPrintArea } from 'shared';

import { PATHS } from '@/constants/paths';

import { RepositoryRemote } from '@/services';

import { CopyButton } from '@/components/common/CopyButton';
import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { handleAxiosError } from '@/utils';
import { findMatchingVariation, groupAttributeOptions } from '@/utils/catalogVariant';
import { cn } from '@/utils/cn';
import { toFullSizeImageUrl } from '@/utils/imageUrl';

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatUsd(value?: number): string {
  return value == null ? '—' : usdFormatter.format(value);
}

const HTML_CONTENT_CLASSES = cn(
  'text-sm leading-relaxed text-foreground/90',
  '[&_p]:my-2 [&_li]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2',
  '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-5 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2',
  '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3',
  '[&_a]:text-primary [&_a]:underline [&_strong]:font-semibold',
  '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl [&_img]:my-3 [&_img]:border [&_img]:border-border',
  '[&_table]:w-full [&_table]:my-3 [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
);

/** 3 phương thức ship hệ cũ — mỗi phương thức 1 mức giá riêng trên biến thể. */
const SHIP_METHOD_KEYS = ['cod', 'expressUs', 'tiktok'] as const;
type ShipMethodKey = (typeof SHIP_METHOD_KEYS)[number];

function shipMethodPrice(
  v: CustomerCatalogItem['variations'][number] | undefined,
  key: ShipMethodKey,
): number | undefined {
  if (!v) return undefined;
  if (key === 'cod') return v.shipCodPrice;
  if (key === 'tiktok') return v.tiktokPrice;
  return v.retailPrice;
}

/**
 * Render nội dung mô tả từ hệ cũ: HTML → sanitize DOMPurify (BẮT BUỘC — data
 * từ hệ ngoài) + bộ class style sẵn; plain text → giữ xuống dòng.
 */
function HtmlContent({ html, className }: { html: string; className?: string }) {
  if (!/<[a-z][^>]*>/i.test(html)) {
    return <p className={cn('text-sm leading-relaxed text-foreground/90 whitespace-pre-line', className)}>{html}</p>;
  }
  return (
    <div
      className={cn(HTML_CONTENT_CLASSES, className)}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
    />
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
  const [shipMethod, setShipMethod] = useState<ShipMethodKey>('expressUs');

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

  // TẤT CẢ ảnh sản phẩm: mockup (ảnh chính) + gallery `images[]` + bảng size — dedupe giữ thứ tự.
  const images = useMemo(() => {
    const list = [item?.mockup, ...(item?.images || []), item?.sizeChartUrl].filter((u): u is string => Boolean(u));
    return [...new Set(list)];
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

  // Phương thức ship khả dụng theo data thật (mirror selector "Shipping Method"
  // hệ cũ) — giá hiển thị đổi theo phương thức đang chọn; promotion chỉ áp cột
  // Express US (`retailPrice`).
  const shipMethods = SHIP_METHOD_KEYS.filter((key) => item.variations.some((v) => shipMethodPrice(v, key) != null));
  const activeShip: ShipMethodKey = shipMethods.includes(shipMethod) ? shipMethod : shipMethods[0] ?? 'expressUs';

  const price =
    activeShip === 'expressUs'
      ? matched?.discountedPrice ?? matched?.retailPrice
      : shipMethodPrice(matched, activeShip);
  const hasDiscount =
    activeShip === 'expressUs' && matched?.discountedPrice != null && matched.discountedPrice !== matched.retailPrice;

  const templateAreas = (item.printArea || []).filter((a): a is CustomerCatalogPrintArea & { templateUrl: string } =>
    Boolean(a.templateUrl),
  );
  const hasTemplateInfo = Boolean(
    item.templateDescription || item.printTemplate || item.printDocument || templateAreas.length > 0,
  );
  const infoTabs = [
    ...(item.description || item.shortDescription ? ['details'] : []),
    ...(hasTemplateInfo ? ['template'] : []),
    'variations',
  ];

  // Cột bảng biến thể theo data thật: 1 cột / label thuộc tính (SIZE, COLOR...),
  // cột weight/giá chỉ hiện khi có ít nhất 1 biến thể mang giá trị.
  const variationAttrLabels = [...new Set(item.variations.flatMap((v) => (v.attributes || []).map((a) => a.label)))];
  const variationCols = {
    weight: item.variations.some((v) => v.weight != null),
    shipCod: item.variations.some((v) => v.shipCodPrice != null),
    expressUs: item.variations.some((v) => v.retailPrice != null),
    tiktok: item.variations.some((v) => v.tiktokPrice != null),
  };

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
        {/* ── Gallery: ảnh chính trên, strip thumbnail bo tròn cuộn ngang bên dưới (mirror trang hệ cũ) ── */}
        <div className="min-w-0">
          <div className="aspect-square rounded-2xl border border-border bg-white flex items-center justify-center overflow-hidden p-4">
            {images[activeImage] ? (
              // Ảnh to phải dùng bản full-size — URL trong DB nhiều bản là thumb WordPress `-100x100` sẽ mờ.
              <img
                key={activeImage}
                src={toFullSizeImageUrl(images[activeImage])}
                alt={item.fullName}
                className="w-full h-full object-contain"
                onError={(e) => {
                  const original = images[activeImage];
                  if (original && e.currentTarget.src !== original && !e.currentTarget.dataset.fellBack) {
                    e.currentTarget.dataset.fellBack = '1';
                    e.currentTarget.src = original;
                  }
                }}
              />
            ) : (
              <ImageIcon size={40} className="text-muted-foreground" />
            )}
          </div>
          {images.length > 1 && (
            // overflow-x-auto cũng clip theo trục dọc → cần py/px trong vùng cuộn kẻo ring ảnh đang chọn bị cắt.
            <div className="flex gap-3 mt-1.5 overflow-x-auto py-1.5 px-1 -mx-1">
              {images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    'w-20 h-20 rounded-2xl overflow-hidden bg-muted shrink-0 transition-all duration-200 border',
                    // Ảnh đang chọn nổi bật, các ảnh còn lại LU MỜ (không viền đậm — viền tối nhìn thô).
                    i === activeImage
                      ? 'border-primary/60 ring-2 ring-primary/25 shadow-sm'
                      : 'border-transparent opacity-45 hover:opacity-100 hover:border-border',
                  )}
                >
                  <img
                    src={src}
                    alt={`${item.fullName} ${i + 1}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Info panel ──────────────────────────────────── */}
        <div className="min-w-0">
          {item.productCategory && <p className="text-xs text-muted-foreground mb-1">{item.productCategory}</p>}
          <h1 className="text-xl font-semibold mb-3">{item.fullName}</h1>

          {(item.printMethod || (item.collections && item.collections.length > 0)) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {item.printMethod && <Badge>{item.printMethod}</Badge>}
              {(item.collections || []).map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-2xl font-bold text-primary">{formatUsd(price)}</span>
            {hasDiscount && matched?.retailPrice != null && (
              <span className="text-sm line-through text-muted-foreground">{formatUsd(matched.retailPrice)}</span>
            )}
          </div>

          {/* ── Shipping Method: chọn phương thức → giá phía trên đổi theo (mirror hệ cũ) ── */}
          {shipMethods.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {t('catalogDetail.shippingMethod')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {shipMethods.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setShipMethod(key)}
                    className={cn(
                      'h-9 px-3.5 rounded-lg border text-xs font-semibold transition-colors',
                      activeShip === key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-primary/50 text-primary hover:bg-primary/10',
                    )}
                  >
                    {t(`catalogDetail.shipMethods.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 mb-5">
            {attributeGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  {group.label}
                </p>
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

          {/* ── Info block: IMPORT US TAX / SKU / PACKAGE (mirror hệ cũ — nhãn đậm navy, giá trị đỏ) ── */}
          {(item.usImportTaxPerUnit != null || matched) && (
            <div className="rounded-xl border border-border bg-muted/30 px-3.5 py-3 space-y-1.5 text-sm mb-5">
              {item.usImportTaxPerUnit != null && (
                <p>
                  <span className="font-bold uppercase">{t('catalogDetail.importUsTax')}:</span>{' '}
                  <span className="text-red-500 font-medium">
                    {formatUsd(item.usImportTaxPerUnit)}
                    {t('catalogDetail.perUnit')}
                  </span>
                </p>
              )}
              {matched?.sku && (
                <p>
                  <span className="font-bold uppercase">{t('catalogDetail.sku')}:</span> {matched.sku}
                  <CopyButton value={matched.sku} label={t('catalogDetail.sku')} className="ml-1" />
                </p>
              )}
              {(matched?.packageGram ?? matched?.weight) != null && (
                <p>
                  <span className="font-bold uppercase">{t('catalogDetail.package')}:</span>{' '}
                  {matched?.packageGram ?? matched?.weight}gram
                  {matched?.height != null && matched?.length != null && matched?.width != null && (
                    <span className="text-red-500">
                      {' '}
                      ({matched.height}cm x {matched.length}cm x {matched.width}cm)
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {item.printArea && item.printArea.length > 0 && (
            <p className="text-xs text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{t('catalogDetail.printArea')}:</span>{' '}
              {item.printArea
                .map((a) => (a.widthPx && a.heightPx ? `${a.label} (${a.widthPx}×${a.heightPx} px)` : a.label))
                .join(', ')}
            </p>
          )}

          {(item.printTemplate || item.printDocument) && (
            <p className="text-xs text-muted-foreground mb-4">
              {item.printTemplate && (
                <a href={item.printTemplate} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {t('catalogDetail.downloadPrintTemplate')}
                </a>
              )}
              {item.printTemplate && item.printDocument && ' · '}
              {item.printDocument && (
                <a href={item.printDocument} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {t('catalogDetail.printDocs')}
                </a>
              )}
            </p>
          )}

          {item.itemSpecifics && item.itemSpecifics.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/60 px-3 py-2">
                {t('catalogDetail.specs')}
              </p>
              <dl className="divide-y divide-border">
                {item.itemSpecifics.map((spec) => (
                  <div key={spec.label} className="grid grid-cols-[minmax(0,140px)_1fr] gap-2 px-3 py-1.5 text-xs">
                    <dt className="text-muted-foreground truncate">{spec.label}</dt>
                    <dd className="text-foreground break-words">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

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

      {/* ── "{Tên} Information": block tab full-width dưới cùng, mirror trang sản phẩm hệ cũ
          (Product Details / Mockup & Template / Variations & Price) — tab không có nội dung tự ẩn */}
      <div className="mt-10 max-w-4xl">
        <h2 className="text-xl font-bold mb-3">{t('catalogDetail.infoTitle', { name: item.fullName })}</h2>
        <Tabs defaultValue={infoTabs[0]}>
          <TabsList className="w-full justify-start gap-6 h-auto p-0 bg-transparent rounded-none border-b border-border">
            {infoTabs.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="rounded-none bg-transparent px-1 pb-2.5 pt-0 text-sm font-medium border-b-2 border-transparent data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-primary"
              >
                {t(`catalogDetail.infoTabs.${tab}`)}
              </TabsTrigger>
            ))}
          </TabsList>

          {item.description || item.shortDescription ? (
            <TabsContent value="details" className="pt-4">
              {item.shortDescription && <HtmlContent html={item.shortDescription} className="mb-4" />}
              {item.description && <HtmlContent html={item.description} />}
            </TabsContent>
          ) : null}

          {hasTemplateInfo && (
            <TabsContent value="template" className="pt-4">
              {item.templateDescription && <HtmlContent html={item.templateDescription} className="mb-4" />}
              {(item.printTemplate || item.printDocument || templateAreas.length > 0) && (
                <div className="flex flex-col gap-1.5 text-sm">
                  {item.printTemplate && (
                    <a
                      href={item.printTemplate}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline w-fit"
                    >
                      👉 {t('catalogDetail.downloadPrintTemplate')}
                    </a>
                  )}
                  {item.printDocument && (
                    <a
                      href={item.printDocument}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline w-fit"
                    >
                      👉 {t('catalogDetail.printDocs')}
                    </a>
                  )}
                  {templateAreas.map((area) => (
                    <a
                      key={area.key}
                      href={area.templateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline w-fit"
                    >
                      👉{' '}
                      {t('catalogDetail.downloadAreaTemplate', {
                        label: area.label,
                        size: area.widthPx && area.heightPx ? ` (${area.widthPx}×${area.heightPx} px)` : '',
                      })}
                    </a>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value="variations" className="pt-4">
            {/* Bảng mirror layout hệ cũ: cột thuộc tính (SIZE...) | SKU chip + copy | WEIGHT (kích thước đỏ) | 3 cột giá ship — cột không có data trên mọi biến thể tự ẩn */}
            <div className="rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 text-left text-xs text-muted-foreground uppercase tracking-wide">
                    {variationAttrLabels.map((label) => (
                      <th key={label} className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 font-semibold">{t('catalogDetail.sku')}</th>
                    {variationCols.weight && (
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">{t('catalogDetail.colWeight')}</th>
                    )}
                    {variationCols.shipCod && (
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">{t('catalogDetail.colShipCod')}</th>
                    )}
                    {variationCols.expressUs && (
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        {t('catalogDetail.colShipExpressUs')}
                      </th>
                    )}
                    {variationCols.tiktok && (
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        {t('catalogDetail.colShipTiktok')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {item.variations.map((v) => {
                    const attrMap = new Map((v.attributes || []).map((a) => [a.label, a.value]));
                    const vHasDiscount = v.discountedPrice != null && v.discountedPrice !== v.retailPrice;
                    const dims =
                      v.height != null && v.length != null && v.width != null
                        ? `${v.height}cm x ${v.length}cm x ${v.width}cm`
                        : null;
                    return (
                      <tr key={v.sku} className="hover:bg-muted/40">
                        {variationAttrLabels.map((label) => (
                          <td key={label} className="px-3 py-2.5 whitespace-nowrap">
                            {attrMap.get(label) ?? '—'}
                          </td>
                        ))}
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 rounded-lg border border-teal-400/60 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 px-2 py-0.5 font-mono text-xs whitespace-nowrap">
                            {v.sku}
                            <CopyButton value={v.sku} label={t('catalogDetail.sku')} />
                          </span>
                        </td>
                        {variationCols.weight && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {v.weight != null ? `${v.weight}g` : '—'}
                            {v.weight != null && dims && <span className="text-red-500 text-xs"> ({dims})</span>}
                          </td>
                        )}
                        {variationCols.shipCod && (
                          <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatUsd(v.shipCodPrice)}
                          </td>
                        )}
                        {variationCols.expressUs && (
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="font-semibold text-primary">
                              {formatUsd(v.discountedPrice ?? v.retailPrice)}
                            </span>
                            {vHasDiscount && v.retailPrice != null && (
                              <span className="ml-1.5 text-xs line-through text-muted-foreground">
                                {formatUsd(v.retailPrice)}
                              </span>
                            )}
                          </td>
                        )}
                        {variationCols.tiktok && (
                          <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-primary">
                            {formatUsd(v.tiktokPrice)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default CustomerCatalogDetail;
