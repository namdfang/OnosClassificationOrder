'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Image as ImageIcon, PackageSearch, ShoppingCart, Trash2 } from 'lucide-react';
import type { CustomerCatalogItem, CustomerStagingOrder } from 'shared';
import { designAcceptKeys } from 'shared/client';
import { CatalogProductCard } from '@/components/orders/catalog-product-card';
import { OrdersPagination } from '@/components/orders/orders-pagination';
import { Button } from '@/components/shared/button';
import { FileUrlOrUploadInput } from '@/components/shared/file-url-or-upload-input';
import { PageHeader } from '@/components/shared/page-header';
import { SafeImage } from '@/components/shared/safe-image';
import { SearchInput } from '@/components/shared/search-input';
import { useToast } from '@/components/shared/toast';
import { apiFetch, useApi } from '@/hooks/use-api';
import { findMatchingVariation, groupAttributeOptions, pickColorSize } from '@/lib/catalog-variant';
import { productLineHref, type ProductLine } from '@/lib/product-lines';
import type { ApiRes } from '@/lib/customer-orders';
import { fmtUSD } from '@/lib/utils';

/** 1 sản phẩm đã "Thêm vào đơn" — mỗi item thành 1 đơn sản xuất riêng, dùng CHUNG địa chỉ ship. */
interface CartItem {
  key: string;
  type: string;
  color?: string;
  size?: string;
  mockupUrl: string;
  printMethod?: string;
  quantity: number;
  designs: Record<string, string>;
  printAreaLabels: Record<string, string>;
  displaySku?: string;
  displayPrice?: number;
}

const ADDRESS_FIELDS = ['firstName', 'lastName', 'address1', 'address2', 'company', 'city', 'postcode', 'state', 'country', 'phone', 'email'] as const;
type AddressField = (typeof ADDRESS_FIELDS)[number];
const REQUIRED: AddressField[] = ['firstName', 'phone', 'address1', 'city'];
const LABEL_KEY: Record<AddressField, string> = {
  firstName: 'shippingFirstName',
  lastName: 'shippingLastName',
  address1: 'shippingAddress1',
  address2: 'shippingAddress2',
  company: 'shippingCompany',
  city: 'shippingCity',
  postcode: 'shippingPostcode',
  state: 'shippingState',
  country: 'shippingCountry',
  phone: 'shippingPhone',
  email: 'shippingEmail',
};
const VALIDATION_KEY: Partial<Record<AddressField, string>> = {
  firstName: 'shippingNameRequired',
  phone: 'shippingPhoneRequired',
  address1: 'shippingAddress1Required',
  city: 'shippingCityRequired',
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-border1 bg-card text-xs text-text-primary outline-none focus:border-accent';

export function CreateOrderView({ line }: { line: ProductLine }) {
  const { t } = useTranslation(['customerPortal', 'seller']);
  const { toast } = useToast();
  const router = useRouter();

  // ── Bộ chọn sản phẩm (catalog theo tier, lọc theo dòng sản phẩm)
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const catalogQuery = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) p.set('search', q);
    p.set('productLine', line);
    return p.toString();
  }, [page, limit, q, line]);
  const [product, setProduct] = useState<CustomerCatalogItem | null>(null);
  const { data: catalogRes, loading: pickerLoading } = useApi<ApiRes<CustomerCatalogItem[]>>(product ? null : `/api/v1/customer/catalog?${catalogQuery}`);
  const pickerItems = useMemo(() => catalogRes?.data ?? [], [catalogRes]);
  const pickerTotal = catalogRes?.total ?? 0;

  // ── Sản phẩm đang cấu hình
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [designUrls, setDesignUrls] = useState<Record<string, string>>({});
  const [mockupUrl, setMockupUrl] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);
  const attributeGroups = useMemo(() => groupAttributeOptions(product?.variations || []), [product]);
  const matched = useMemo(
    () => (product ? (findMatchingVariation(product.variations, selectedAttrs) ?? product.variations[0]) : undefined),
    [product, selectedAttrs],
  );
  const printAreas = useMemo(() => product?.printArea ?? [], [product]);
  const price = matched?.discountedPrice ?? matched?.retailPrice;
  const acceptKeys = useMemo(() => designAcceptKeys(printAreas), [printAreas]);
  const missingMockup = !mockupUrl.trim();
  const missingDesign = acceptKeys.length > 0 && !acceptKeys.some((k) => designUrls[k]?.trim());
  const canAddToCart = !missingMockup && !missingDesign;

  const selectProduct = (p: CustomerCatalogItem) => {
    setProduct(p);
    const initial: Record<string, string> = {};
    for (const attr of p.variations?.[0]?.attributes || []) initial[attr.label] = attr.value;
    setSelectedAttrs(initial);
    setDesignUrls({});
    setItemQuantity(1);
    setMockupUrl(''); // mockup là ảnh KHÁCH cung cấp để sản xuất, không lấy ảnh mẫu catalog
  };
  const cancelConfiguring = () => {
    setProduct(null);
    setSelectedAttrs({});
    setDesignUrls({});
    setMockupUrl('');
  };

  // ── Giỏ + địa chỉ + ghi chú
  const [cart, setCart] = useState<CartItem[]>([]);
  const [address, setAddress] = useState<Record<AddressField, string>>(() => Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, ''])) as Record<AddressField, string>);
  const [errors, setErrors] = useState<Partial<Record<AddressField, string>>>({});
  const [referent, setReferent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const cartTotal = useMemo(() => cart.reduce((s, it) => (it.displayPrice != null ? s + it.displayPrice * it.quantity : s), 0), [cart]);

  const addToCart = () => {
    if (!product) return;
    if (missingMockup) {
      toast('error', t('customerPortal:orderNew.validation.mockupRequired'));
      return;
    }
    if (missingDesign) {
      const labels = acceptKeys.map((k) => printAreas.find((a) => a.key === k)?.label ?? k).join(' / ');
      toast('error', t('customerPortal:orderNew.validation.designRequired', { area: labels }));
      return;
    }
    const { color, size } = pickColorSize(selectedAttrs);
    setCart((prev) => [
      ...prev,
      {
        key: `${product._id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: product.fullName,
        color,
        size,
        mockupUrl,
        printMethod: product.printMethod,
        quantity: itemQuantity,
        designs: Object.fromEntries(Object.entries(designUrls).filter(([, v]) => v.trim())),
        printAreaLabels: Object.fromEntries(printAreas.map((a) => [a.key, a.label])),
        displaySku: matched?.sku,
        displayPrice: price,
      },
    ]);
    cancelConfiguring();
  };

  const submit = async () => {
    if (cart.length === 0) {
      toast('error', t('customerPortal:orderNew.validation.cartRequired'));
      return;
    }
    const next: Partial<Record<AddressField, string>> = {};
    for (const f of REQUIRED) if (!address[f].trim()) next[f] = t(`customerPortal:orderNew.validation.${VALIDATION_KEY[f]}`);
    if (address.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email.trim())) next.email = t('customerPortal:orderNew.validation.shippingEmailInvalid');
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    try {
      const clean = Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, address[f].trim() || undefined]));
      const res = await apiFetch<ApiRes<CustomerStagingOrder>>('/api/v1/customer/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((it) => ({ type: it.type, color: it.color, size: it.size, mockupUrl: it.mockupUrl, printMethod: it.printMethod, quantity: it.quantity, designs: it.designs })),
          shippingAddress: clean,
          referent: referent.trim() || undefined,
        }),
      });
      toast('success', t('customerPortal:orderNew.successPending', { count: res.data?.items?.length ?? cart.length }));
      router.push(`${productLineHref(line)}?status=pending`);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const pages = Math.max(1, Math.ceil(pickerTotal / limit));

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Link href={productLineHref(line)} prefetch={false} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
        <ArrowLeft size={13} /> {t('customerPortal:productLines.' + line)}
      </Link>
      <PageHeader title={`${t('customerPortal:orderNew.title')} · ${t('customerPortal:productLines.' + line)}`} subtitle={t('customerPortal:orderNew.subtitle')} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div className="space-y-4 min-w-0">
          {!product ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-bold text-text-primary">{t('customerPortal:orderNew.pickProduct')}</h2>
                <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('customerPortal:orderNew.searchPlaceholder')} className="w-72" />
              </div>
              {pickerLoading && pickerItems.length === 0 ? (
                <div className="flex justify-center py-16">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : pickerItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  <PackageSearch size={26} className="mb-2" />
                  <p className="text-sm">{t('customerPortal:orderNew.searchEmpty')}</p>
                </div>
              ) : (
                <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 transition-opacity ${pickerLoading ? 'opacity-60' : ''}`}>
                  {pickerItems.map((p) => (
                    <CatalogProductCard key={p._id} item={p} onSelect={() => selectProduct(p)} />
                  ))}
                </div>
              )}
              {pickerTotal > 0 && (
                <OrdersPagination page={page} limit={limit} pages={pages} total={pickerTotal} onChange={(n) => { if (n.page) setPage(n.page); if (n.limit) { setLimit(n.limit); setPage(1); } }} />
              )}
            </div>
          ) : (
            <>
              <div className="bg-card border border-border1 rounded-xl p-4">
                <div className="flex gap-3 mb-3">
                  <SafeImage
                    src={product.mockupLarge ?? product.mockup}
                    alt={product.fullName}
                    className="w-16 h-16 rounded-lg object-cover border border-border1 bg-surface-muted shrink-0"
                    fallback={<div className="w-16 h-16 rounded-lg border border-dashed border-border1 shrink-0" />}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-text-primary truncate">{product.fullName}</p>
                    {matched?.sku && <p className="text-[11px] text-text-muted mt-0.5">{t('customerPortal:catalogDetail.sku')}: {matched.sku}</p>}
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {price != null && <p className="text-sm font-bold text-accent tabular-nums">{fmtUSD(price)}</p>}
                      {product.printMethod && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border1 text-text-secondary">{product.printMethod}</span>}
                    </div>
                    <button type="button" onClick={cancelConfiguring} className="text-[11px] text-accent hover:underline mt-1">
                      {t('customerPortal:orderNew.changeProduct')}
                    </button>
                  </div>
                </div>
                {attributeGroups.length > 0 && (
                  <div className="space-y-2.5">
                    {attributeGroups.map((group) => (
                      <div key={group.label}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1.5">{group.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.values.map((value) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setSelectedAttrs((prev) => ({ ...prev, [group.label]: value }))}
                              className={`h-8 min-w-9 px-2.5 rounded-md border text-xs font-medium transition-colors ${
                                selectedAttrs[group.label] === value ? 'bg-accent text-white border-accent' : 'bg-card border-border1 text-text-secondary hover:bg-card-hover'
                              }`}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-card border border-border1 rounded-xl p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-primary">{t('customerPortal:orderNew.quantity')}</label>
                  <input type="number" min={1} value={itemQuantity} onChange={(e) => setItemQuantity(Math.max(1, Number(e.target.value) || 1))} className={`${inputCls} w-32`} />
                </div>
                {(product.printTemplate || product.printDocument) && (
                  <p className="text-[11px] text-text-muted">
                    {product.printTemplate && <a href={product.printTemplate} target="_blank" rel="noreferrer" className="text-accent hover:underline">{t('customerPortal:orderNew.productTemplate')}</a>}
                    {product.printTemplate && product.printDocument && ' · '}
                    {product.printDocument && <a href={product.printDocument} target="_blank" rel="noreferrer" className="text-accent hover:underline">{t('customerPortal:orderNew.productPrintDocs')}</a>}
                  </p>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-primary">
                    {t('customerPortal:orderNew.mockupUrl')} <span className="text-error">*</span>
                  </label>
                  <p className="text-[11px] text-text-muted">{t('customerPortal:orderNew.mockupUrlHelp')}</p>
                  <FileUrlOrUploadInput value={mockupUrl} onChange={setMockupUrl} placeholder={t('customerPortal:orderNew.mockupUrlPlaceholder')} />
                </div>
                {printAreas.map((area) => {
                  const required = area.isRequired !== false;
                  const sizeHint = area.widthPx && area.heightPx ? `${area.widthPx} × ${area.heightPx} px` : undefined;
                  return (
                    <div key={area.key} className="space-y-1.5">
                      <label className="text-xs font-semibold text-text-primary">
                        {t('customerPortal:orderNew.designUrl', { area: area.label })}{' '}
                        {required ? <span className="text-error">*</span> : <span className="text-[10px] font-normal text-text-muted">({t('customerPortal:orderNew.designOptional')})</span>}
                      </label>
                      {(area.templateUrl || sizeHint) && (
                        <p className="text-[11px] text-text-muted">
                          {area.templateUrl && <a href={area.templateUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">{t('customerPortal:orderNew.downloadAreaTemplate')}</a>}
                          {area.templateUrl && sizeHint && ' · '}
                          {sizeHint && t('customerPortal:orderNew.designSizeHint', { size: sizeHint })}
                        </p>
                      )}
                      <FileUrlOrUploadInput value={designUrls[area.key] ?? ''} onChange={(v) => setDesignUrls((prev) => ({ ...prev, [area.key]: v }))} placeholder={t('customerPortal:orderNew.designUrlPlaceholder')} />
                    </div>
                  );
                })}
                <Button variant="primary" onClick={addToCart} disabled={!canAddToCart} className="w-full">
                  <ShoppingCart size={14} className="mr-1.5" />
                  {t('customerPortal:orderNew.addToCart')}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="lg:sticky lg:top-4 space-y-4">
          <div className="bg-card border border-border1 rounded-xl p-4">
            <h2 className="text-sm font-bold text-text-primary mb-3">{t('customerPortal:orderNew.cartTitle', { count: cart.length })}</h2>
            {cart.length === 0 ? (
              <p className="text-xs text-text-muted">{t('customerPortal:orderNew.cartEmpty')}</p>
            ) : (
              <div className="space-y-3">
                {cart.map((it) => (
                  <div key={it.key} className="flex gap-2.5 pb-3 border-b border-border2 last:border-0 last:pb-0">
                    <SafeImage src={it.mockupUrl} alt={it.type} className="w-14 h-14 rounded-md object-cover border border-border1 bg-surface-muted shrink-0" fallback={<div className="w-14 h-14 rounded-md border border-dashed border-border1 shrink-0" />} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-text-primary truncate">{it.type}</p>
                        <button type="button" onClick={() => setCart((prev) => prev.filter((x) => x.key !== it.key))} className="text-text-muted hover:text-error shrink-0" aria-label={t('customerPortal:orderNew.removeFromCart')}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <p className="text-[11px] text-text-muted">{[it.color, it.size].filter(Boolean).join(' / ') || '—'} · ×{it.quantity}{it.displayPrice != null ? ` · ${fmtUSD(it.displayPrice)}` : ''}</p>
                      {Object.keys(it.designs).length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {Object.entries(it.designs).map(([key, url]) => (
                            <a key={key} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-accent hover:underline truncate">
                              <ImageIcon size={10} className="shrink-0" />
                              <span className="truncate">{it.printAreaLabels[key] ?? key}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {cartTotal > 0 && (
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-border2">
                    <span className="text-text-muted">{t('customerPortal:orderNew.cartTotal')}</span>
                    <span className="font-bold text-accent tabular-nums">{fmtUSD(cartTotal)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-card border border-border1 rounded-xl p-4 space-y-2.5">
            <h2 className="text-sm font-bold text-text-primary">{t('customerPortal:orderNew.shippingTitle')}</h2>
            <div className="grid grid-cols-2 gap-2">
              {ADDRESS_FIELDS.map((f) => (
                <div key={f} className={['address1', 'address2', 'company', 'country'].includes(f) ? 'col-span-2' : ''}>
                  <label className="text-[10px] font-semibold text-text-muted uppercase block mb-1">
                    {t(`customerPortal:orderNew.${LABEL_KEY[f]}`)} {REQUIRED.includes(f) && <span className="text-error">*</span>}
                  </label>
                  <input value={address[f]} onChange={(e) => setAddress((a) => ({ ...a, [f]: e.target.value }))} className={`${inputCls} ${errors[f] ? 'border-error' : ''}`} type={f === 'email' ? 'email' : 'text'} />
                  {errors[f] && <p className="text-[10px] text-error mt-0.5">{errors[f]}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border1 rounded-xl p-4 space-y-3">
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase block mb-1">{t('customerPortal:orderNew.note')}</label>
              <textarea value={referent} onChange={(e) => setReferent(e.target.value)} placeholder={t('customerPortal:orderNew.notePlaceholder')} rows={3} className={inputCls} />
            </div>
            <Button variant="primary" className="w-full" loading={submitting} disabled={cart.length === 0} onClick={submit}>
              {t('customerPortal:orderNew.submit', { count: cart.length })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
