import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { ImageIcon, PackageSearch, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import type { CustomerCatalogItem, CustomerOrderSummary } from 'shared';
import { toast } from 'sonner';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { FileUrlOrUploadInput } from '@/components/common/FileUrlOrUploadInput';
import { LoadingOverlay } from '@/components/common/LoadingOverlay';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { CatalogProductCard } from '@/components/customer/CatalogProductCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { useDebounce } from '@/hooks/useDebounce';

import { PATHS } from '../../../constants/paths';
import { RepositoryRemote } from '../../../services';
import { handleAxiosError } from '../../../utils';
import { findMatchingVariation, groupAttributeOptions, pickColorSize } from '../../../utils/catalogVariant';
import { cn } from '../../../utils/cn';

/** State điều hướng từ trang chi tiết catalog (`/customer/catalog/:id`) — xem `CustomerCatalogDetail.handleNewOrder`. */
interface CatalogOrderState {
  fromCatalog: true;
  product: CustomerCatalogItem;
  selectedAttrs: Record<string, string>;
}

/** 1 sản phẩm đã "Thêm vào đơn hàng" — mỗi item sẽ thành 1 production order riêng, dùng CHUNG 1 địa chỉ ship của cả đơn. */
interface CartItem {
  key: string;
  type: string;
  color?: string;
  size?: string;
  mockupUrl?: string;
  printMethod?: string;
  quantity: number;
  designs?: Record<string, string>;
  /** Snapshot key → nhãn vị trí in (lúc "Thêm vào đơn hàng") — dùng để hiện tên thay vì key thô trong giỏ. */
  printAreaLabels?: Record<string, string>;
  displayMockup?: string;
  displaySku?: string;
  displayPrice?: number;
}

function buildCheckoutSchema(t: TFunction<'customerPortal'>) {
  return z.object({
    quantity: z.coerce.number().int().positive().default(1),
    mockupUrl: z.string().optional(),
    shippingFirstName: z.string().min(1, t('orderNew.validation.shippingNameRequired')),
    shippingLastName: z.string().optional(),
    shippingCompany: z.string().optional(),
    shippingPhone: z.string().min(1, t('orderNew.validation.shippingPhoneRequired')),
    shippingEmail: z.string().email(t('orderNew.validation.shippingEmailInvalid')).optional().or(z.literal('')),
    shippingAddress1: z.string().min(1, t('orderNew.validation.shippingAddress1Required')),
    shippingAddress2: z.string().optional(),
    shippingCity: z.string().min(1, t('orderNew.validation.shippingCityRequired')),
    shippingState: z.string().optional(),
    shippingPostcode: z.string().optional(),
    shippingCountry: z.string().optional(),
    referent: z.string().optional(),
  });
}

type CheckoutFormValues = z.infer<ReturnType<typeof buildCheckoutSchema>>;

const PICKER_PAGE_SIZE = 12;

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatUsd(value?: number): string {
  return value == null ? '—' : usdFormatter.format(value);
}

function CustomerOrderNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('customerPortal');
  const [loading, setLoading] = useState(false);

  const navState = (location.state as CatalogOrderState | null)?.fromCatalog
    ? (location.state as CatalogOrderState)
    : null;

  // Sản phẩm ĐANG cấu hình (chưa "Thêm vào đơn hàng") — khác `cart`, xem CartItem.
  const [product, setProduct] = useState<CustomerCatalogItem | null>(navState?.product ?? null);
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>(navState?.selectedAttrs ?? {});
  const [designUrls, setDesignUrls] = useState<Record<string, string>>({});
  const [mockupUrl, setMockupUrl] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);

  const [cart, setCart] = useState<CartItem[]>([]);

  // ── Bộ chọn sản phẩm — lưới ĐẦY ĐỦ (không giới hạn vài kết quả), giữ tìm kiếm. ──
  const [pickerSearch, setPickerSearch] = useState('');
  const debouncedPickerSearch = useDebounce(pickerSearch, 300);
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerTotal, setPickerTotal] = useState(0);
  const [pickerItems, setPickerItems] = useState<CustomerCatalogItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const checkoutSchema = useMemo(() => buildCheckoutSchema(t), [t]);
  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      quantity: 1,
      mockupUrl: '',
      shippingFirstName: '',
      shippingLastName: '',
      shippingCompany: '',
      shippingPhone: '',
      shippingEmail: '',
      shippingAddress1: '',
      shippingAddress2: '',
      shippingCity: '',
      shippingState: '',
      shippingPostcode: '',
      shippingCountry: '',
      referent: '',
    },
  });

  useEffect(() => {
    if (product) return;
    (async () => {
      try {
        setPickerLoading(true);
        const params = new URLSearchParams({ page: String(pickerPage), limit: String(PICKER_PAGE_SIZE) });
        if (debouncedPickerSearch) params.set('search', debouncedPickerSearch);
        const res = await RepositoryRemote.customerCatalog.getCatalog(`?${params.toString()}`);
        setPickerItems(res?.data?.data ?? []);
        setPickerTotal(res?.data?.total ?? 0);
      } catch (error) {
        handleAxiosError(error);
      } finally {
        setPickerLoading(false);
      }
    })();
  }, [product, pickerPage, debouncedPickerSearch]);

  const isFirstPickerRender = React.useRef(true);
  useEffect(() => {
    if (isFirstPickerRender.current) {
      isFirstPickerRender.current = false;
      return;
    }
    setPickerPage(1);
  }, [debouncedPickerSearch]);

  const attributeGroups = useMemo(() => groupAttributeOptions(product?.variations || []), [product]);
  const matched = useMemo(
    () => (product ? findMatchingVariation(product.variations, selectedAttrs) ?? product.variations[0] : undefined),
    [product, selectedAttrs],
  );
  const printAreas = product?.printArea ?? [];
  const price = matched?.discountedPrice ?? matched?.retailPrice;

  const handleSelectProduct = (p: CustomerCatalogItem) => {
    setProduct(p);
    const initial: Record<string, string> = {};
    for (const attr of p.variations?.[0]?.attributes || []) initial[attr.label] = attr.value;
    setSelectedAttrs(initial);
    setDesignUrls({});
    setItemQuantity(1);
    // Ảnh mockup là ảnh khách TỰ CUNG CẤP để sản xuất — để trống, KHÔNG mặc
    // định ảnh mẫu catalog (`p.mockup` chỉ minh họa sản phẩm, không phải file sản xuất).
    setMockupUrl('');
  };

  const handleCancelConfiguring = () => {
    setProduct(null);
    setSelectedAttrs({});
    setDesignUrls({});
    setMockupUrl('');
  };

  // Bắt buộc mockup + design các vị trí in BẮT BUỘC (`isRequired !== false` —
  // vị trí không set cờ coi như bắt buộc, giữ behavior cũ) TRƯỚC khi cho thêm
  // vào đơn — xưởng không thể sản xuất thiếu.
  const missingMockup = !mockupUrl.trim();
  const missingDesignAreas = printAreas.filter((a) => a.isRequired !== false && !designUrls[a.key]?.trim());
  const canAddToCart = !missingMockup && missingDesignAreas.length === 0;

  const handleAddToCart = () => {
    if (!product) return;
    if (missingMockup) {
      toast.error(t('orderNew.validation.mockupRequired'));
      return;
    }
    if (missingDesignAreas.length > 0) {
      toast.error(t('orderNew.validation.designRequired', { area: missingDesignAreas[0].label }));
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
        // Vị trí optional bỏ trống → không gửi key rỗng vào order.designs.
        designs: Object.fromEntries(Object.entries(designUrls).filter(([, v]) => v.trim())),
        printAreaLabels: Object.fromEntries(printAreas.map((a) => [a.key, a.label])),
        displayMockup: mockupUrl,
        displaySku: matched?.sku,
        displayPrice: price,
      },
    ]);
    handleCancelConfiguring();
  };

  const handleRemoveFromCart = (key: string) => setCart((prev) => prev.filter((it) => it.key !== key));

  const cartTotal = useMemo(
    () => cart.reduce((sum, it) => (it.displayPrice != null ? sum + it.displayPrice * it.quantity : sum), 0),
    [cart],
  );

  const onSubmit = async (values: CheckoutFormValues) => {
    if (cart.length === 0) {
      toast.error(t('orderNew.validation.cartRequired'));
      return;
    }
    try {
      setLoading(true);
      const res = await RepositoryRemote.customerOrder.placeOrder({
        items: cart.map((it) => ({
          type: it.type,
          color: it.color,
          size: it.size,
          mockupUrl: it.mockupUrl,
          printMethod: it.printMethod,
          quantity: it.quantity,
          designs: it.designs,
        })),
        shippingAddress: {
          firstName: values.shippingFirstName.trim(),
          lastName: values.shippingLastName?.trim() || undefined,
          company: values.shippingCompany?.trim() || undefined,
          phone: values.shippingPhone.trim(),
          email: values.shippingEmail?.trim() || undefined,
          address1: values.shippingAddress1.trim(),
          address2: values.shippingAddress2?.trim() || undefined,
          city: values.shippingCity.trim(),
          state: values.shippingState?.trim() || undefined,
          postcode: values.shippingPostcode?.trim() || undefined,
          country: values.shippingCountry?.trim() || undefined,
        },
        referent: values.referent?.trim() || undefined,
      });
      const codes = ((res?.data?.data ?? []) as CustomerOrderSummary[]).map((o) => o.productionId).join(', ');
      toast.success(t('orderNew.success', { code: codes }));
      navigate(PATHS.CUSTOMER_ORDERS);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-lg font-semibold">{t('orderNew.title')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('orderNew.subtitle')}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
            {/* ── Cột trái: chọn/cấu hình sản phẩm ─────────────────── */}
            <div className="space-y-5 min-w-0">
              {!product ? (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <h2 className="text-sm font-semibold text-foreground">{t('orderNew.pickProduct')}</h2>
                    <div className="relative w-full sm:w-auto">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={t('orderNew.searchPlaceholder')}
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        className="h-10 pl-9 pr-8 sm:w-72"
                      />
                      {pickerSearch && (
                        <button
                          type="button"
                          onClick={() => setPickerSearch('')}
                          aria-label={t('catalog.clearSearch')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {pickerLoading && pickerItems.length === 0 ? (
                    <div className="flex justify-center py-16">
                      <Spinner size={22} />
                    </div>
                  ) : pickerItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <PackageSearch size={28} className="mb-3" />
                      <p className="text-sm">{t('orderNew.searchEmpty')}</p>
                    </div>
                  ) : (
                    <LoadingOverlay
                      active={pickerLoading}
                      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
                    >
                      {pickerItems.map((p) => (
                        <CatalogProductCard key={p._id} item={p} onSelect={() => handleSelectProduct(p)} />
                      ))}
                    </LoadingOverlay>
                  )}

                  {pickerItems.length > 0 && (
                    <div className="mt-4">
                      <PaginationBar
                        position="bottom"
                        page={pickerPage}
                        pageSize={PICKER_PAGE_SIZE}
                        total={pickerTotal}
                        loading={pickerLoading}
                        onChange={(p) => setPickerPage(p)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex gap-3 mb-3">
                      {product.mockup ? (
                        <img
                          src={product.mockup}
                          alt={product.fullName}
                          className="w-16 h-16 rounded-lg object-cover border border-border bg-muted shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg border border-dashed border-border shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{product.fullName}</p>
                        {matched?.sku && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('catalogDetail.sku')}: {matched.sku}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          {price != null && <p className="text-sm font-semibold text-primary">{formatUsd(price)}</p>}
                          {product.printMethod && (
                            <Badge variant="outline" className="text-[10px]">
                              {product.printMethod}
                            </Badge>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleCancelConfiguring}
                          className="text-xs text-primary underline mt-1"
                        >
                          {t('orderNew.changeProduct')}
                        </button>
                      </div>
                    </div>

                    {attributeGroups.length > 0 && (
                      <div className="space-y-2.5">
                        {attributeGroups.map((group) => (
                          <div key={group.label}>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                              {group.label}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {group.values.map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => setSelectedAttrs((prev) => ({ ...prev, [group.label]: value }))}
                                  className={cn(
                                    'h-8 min-w-9 px-2.5 rounded-md border text-xs font-medium transition-colors',
                                    selectedAttrs[group.label] === value
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background border-input hover:bg-accent',
                                  )}
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

                  <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium leading-none">{t('orderNew.quantity')}</label>
                      <Input
                        type="number"
                        min={1}
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(Math.max(1, Number(e.target.value) || 1))}
                        className="h-10 w-32"
                      />
                    </div>

                    {(product.printTemplate || product.printDocument) && (
                      <p className="text-[11px] text-muted-foreground">
                        {product.printTemplate && (
                          <a
                            href={product.printTemplate}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {t('orderNew.productTemplate')}
                          </a>
                        )}
                        {product.printTemplate && product.printDocument && ' · '}
                        {product.printDocument && (
                          <a
                            href={product.printDocument}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {t('orderNew.productPrintDocs')}
                          </a>
                        )}
                      </p>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium leading-none">
                        {t('orderNew.mockupUrl')} <span className="text-destructive">*</span>
                      </label>
                      <FileUrlOrUploadInput
                        value={mockupUrl}
                        onChange={setMockupUrl}
                        placeholder={t('orderNew.mockupUrlPlaceholder')}
                      />
                    </div>

                    {printAreas.map((area) => {
                      const required = area.isRequired !== false;
                      const sizeHint =
                        area.widthPx && area.heightPx ? `${area.widthPx} × ${area.heightPx} px` : undefined;
                      return (
                        <div key={area.key} className="space-y-1.5">
                          <label className="text-sm font-medium leading-none">
                            {t('orderNew.designUrl', { area: area.label })}{' '}
                            {required ? (
                              <span className="text-destructive">*</span>
                            ) : (
                              <span className="text-xs font-normal text-muted-foreground">
                                ({t('orderNew.designOptional')})
                              </span>
                            )}
                          </label>
                          {(area.templateUrl || sizeHint) && (
                            <p className="text-[11px] text-muted-foreground">
                              {area.templateUrl && (
                                <a
                                  href={area.templateUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {t('orderNew.downloadAreaTemplate')}
                                </a>
                              )}
                              {area.templateUrl && sizeHint && ' · '}
                              {sizeHint && t('orderNew.designSizeHint', { size: sizeHint })}
                            </p>
                          )}
                          <FileUrlOrUploadInput
                            value={designUrls[area.key] ?? ''}
                            onChange={(v) => setDesignUrls((prev) => ({ ...prev, [area.key]: v }))}
                            placeholder={t('orderNew.designUrlPlaceholder')}
                          />
                        </div>
                      );
                    })}

                    <Button type="button" onClick={handleAddToCart} disabled={!canAddToCart} className="w-full h-10">
                      <ShoppingCart size={15} />
                      {t('orderNew.addToCart')}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* ── Cột phải: giỏ hàng + địa chỉ ship + đặt đơn — sticky ── */}
            <div className="lg:sticky lg:top-6 space-y-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <h2 className="text-sm font-semibold mb-3">{t('orderNew.cartTitle', { count: cart.length })}</h2>
                {cart.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('orderNew.cartEmpty')}</p>
                ) : (
                  <div className="space-y-3">
                    {cart.map((it) => (
                      <div key={it.key} className="flex gap-2.5 pb-3 border-b border-border last:border-0 last:pb-0">
                        {it.displayMockup ? (
                          <img
                            src={it.displayMockup}
                            alt={it.type}
                            className="w-14 h-14 rounded-md object-cover border border-border bg-muted shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-md border border-dashed border-border shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium truncate">{it.type}</p>
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(it.key)}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              aria-label={t('orderNew.removeFromCart')}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {[it.color, it.size].filter(Boolean).join(' / ') || '—'} · x{it.quantity}
                          </p>
                          {it.designs && Object.keys(it.designs).length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {Object.entries(it.designs).map(([key, url]) => (
                                <a
                                  key={key}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-[10px] text-primary hover:underline truncate"
                                >
                                  <ImageIcon size={10} className="shrink-0" />
                                  <span className="truncate">{it.printAreaLabels?.[key] ?? key}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {cartTotal > 0 && (
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-border">
                        <span className="text-muted-foreground">{t('orderNew.cartTotal')}</span>
                        <span className="font-semibold text-primary">{formatUsd(cartTotal)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h2 className="text-sm font-semibold">{t('orderNew.shippingTitle')}</h2>

                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="shippingFirstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('orderNew.shippingFirstName')} <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input className="h-9" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shippingLastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('orderNew.shippingLastName')}</FormLabel>
                        <FormControl>
                          <Input className="h-9" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="shippingAddress1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('orderNew.shippingAddress1')} <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input className="h-9" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shippingAddress2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orderNew.shippingAddress2')}</FormLabel>
                      <FormControl>
                        <Input className="h-9" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shippingCompany"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orderNew.shippingCompany')}</FormLabel>
                      <FormControl>
                        <Input className="h-9" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="shippingCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('orderNew.shippingCity')} <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input className="h-9" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shippingPostcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('orderNew.shippingPostcode')}</FormLabel>
                        <FormControl>
                          <Input className="h-9" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="shippingState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orderNew.shippingState')}</FormLabel>
                      <FormControl>
                        <Input className="h-9" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shippingCountry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orderNew.shippingCountry')}</FormLabel>
                      <FormControl>
                        <Input className="h-9" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="shippingPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('orderNew.shippingPhone')} <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input className="h-9" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shippingEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('orderNew.shippingEmail')}</FormLabel>
                        <FormControl>
                          <Input type="email" className="h-9" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <FormField
                  control={form.control}
                  name="referent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orderNew.note')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('orderNew.notePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={loading || cart.length === 0} className="w-full h-10">
                  {loading && <Spinner size={14} className="text-primary-foreground" />}
                  {t('orderNew.submit', { count: cart.length })}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default CustomerOrderNew;
