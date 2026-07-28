import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { ImageIcon, Search } from 'lucide-react';
import type { CustomerCatalogItem } from 'shared';
import { toast } from 'sonner';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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

function buildPlaceOrderSchema(t: TFunction<'customerPortal'>) {
  return z.object({
    type: z.string().min(1, t('orderNew.validation.typeRequired')),
    color: z.string().optional(),
    size: z.string().optional(),
    quantity: z.coerce.number().int().positive().default(1),
    mockupUrl: z.string().optional(),
    printMethod: z.string().optional(),
    referent: z.string().optional(),
  });
}

type PlaceOrderFormValues = z.infer<ReturnType<typeof buildPlaceOrderSchema>>;

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatUsd(value?: number): string {
  return value == null ? '—' : usdFormatter.format(value);
}

function CustomerOrderNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('customerPortal');
  const [loading, setLoading] = useState(false);

  const navState = (location.state as CatalogOrderState | null)?.fromCatalog ? (location.state as CatalogOrderState) : null;

  const [manualMode, setManualMode] = useState(false);
  const [product, setProduct] = useState<CustomerCatalogItem | null>(navState?.product ?? null);
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>(navState?.selectedAttrs ?? {});
  const [designUrls, setDesignUrls] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerCatalogItem[]>([]);
  const [searching, setSearching] = useState(false);

  const placeOrderSchema = useMemo(() => buildPlaceOrderSchema(t), [t]);
  const form = useForm<PlaceOrderFormValues>({
    resolver: zodResolver(placeOrderSchema),
    defaultValues: { type: '', color: '', size: '', quantity: 1, mockupUrl: '', printMethod: '', referent: '' },
  });

  // Không tìm kiếm khi đã chọn sản phẩm hoặc đang ở chế độ nhập tay.
  useEffect(() => {
    if (manualMode || product) return;
    const handle = setTimeout(async () => {
      try {
        setSearching(true);
        const params = new URLSearchParams({ page: '1', limit: '8' });
        if (searchQuery) params.set('search', searchQuery);
        const res = await RepositoryRemote.customerCatalog.getCatalog(`?${params.toString()}`);
        setSearchResults(res?.data?.data ?? []);
      } catch (error) {
        handleAxiosError(error);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery, manualMode, product]);

  const attributeGroups = useMemo(() => groupAttributeOptions(product?.variations || []), [product]);
  const matched = useMemo(
    () => (product ? (findMatchingVariation(product.variations, selectedAttrs) ?? product.variations[0]) : undefined),
    [product, selectedAttrs],
  );
  const printAreas = product?.printArea ?? [];
  const price = matched?.discountedPrice ?? matched?.retailPrice;

  // Đồng bộ sản phẩm/biến thể đã chọn vào field ẩn của form — giữ nguyên logic submit cũ.
  useEffect(() => {
    if (manualMode || !product) return;
    const { color, size } = pickColorSize(selectedAttrs);
    form.setValue('type', product.fullName);
    form.setValue('color', color ?? '');
    form.setValue('size', size ?? '');
    form.setValue('mockupUrl', product.mockup ?? '');
    form.setValue('printMethod', product.printMethod ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, selectedAttrs, manualMode]);

  const handleSelectProduct = (p: CustomerCatalogItem) => {
    setProduct(p);
    const initial: Record<string, string> = {};
    for (const attr of p.variations?.[0]?.attributes || []) initial[attr.label] = attr.value;
    setSelectedAttrs(initial);
    setDesignUrls({});
  };

  const handleChangeProduct = () => {
    setProduct(null);
    setSelectedAttrs({});
    setDesignUrls({});
  };

  const switchToManual = () => {
    handleChangeProduct();
    setManualMode(true);
    form.reset({ type: '', color: '', size: '', quantity: form.getValues('quantity'), mockupUrl: '', printMethod: '', referent: form.getValues('referent') });
  };

  const switchToCatalog = () => {
    setManualMode(false);
    form.setValue('type', '');
    form.setValue('color', '');
    form.setValue('size', '');
    form.setValue('mockupUrl', '');
    form.setValue('printMethod', '');
  };

  const onSubmit = async (values: PlaceOrderFormValues) => {
    try {
      setLoading(true);
      const designs =
        !manualMode && product && Object.values(designUrls).some((v) => v?.trim())
          ? Object.fromEntries(Object.entries(designUrls).filter(([, v]) => v?.trim()))
          : undefined;
      const res = await RepositoryRemote.customerOrder.placeOrder({ ...values, designs });
      toast.success(t('orderNew.success', { code: res?.data?.data?.productionId }));
      navigate(PATHS.CUSTOMER_ORDERS);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitClick = () => {
    if (!manualMode && !product) {
      toast.error(t('orderNew.validation.productRequired'));
      return;
    }
    void form.handleSubmit(onSubmit)();
  };

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold">{t('orderNew.title')}</h1>
        <button
          type="button"
          onClick={manualMode ? switchToCatalog : switchToManual}
          className="text-xs text-primary underline"
        >
          {manualMode ? t('orderNew.useCatalogPicker') : t('orderNew.useManualEntry')}
        </button>
      </div>

      {!manualMode && (
        <div className="mb-4">
          {!product ? (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="relative mb-3">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('orderNew.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 pl-9"
                />
              </div>
              {searching ? (
                <div className="flex justify-center py-6">
                  <Spinner size={20} />
                </div>
              ) : searchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">{t('orderNew.searchEmpty')}</p>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {searchResults.map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => handleSelectProduct(p)}
                      className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent text-left transition-colors"
                    >
                      {p.mockup ? (
                        <img src={p.mockup} alt={p.fullName} className="w-10 h-10 rounded-md object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground shrink-0">
                          <ImageIcon size={14} />
                        </div>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{p.fullName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatUsd(p.variations[0]?.discountedPrice ?? p.variations[0]?.retailPrice)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex gap-3 mb-3">
                {product.mockup ? (
                  <img
                    src={product.mockup}
                    alt={product.fullName}
                    className="w-16 h-16 rounded-lg object-cover border border-border bg-muted shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground shrink-0">
                    <ImageIcon size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{product.fullName}</p>
                  {matched?.sku && <p className="text-xs text-muted-foreground mt-0.5">{t('catalogDetail.sku')}: {matched.sku}</p>}
                  {price != null && <p className="text-sm font-semibold text-primary mt-1">{formatUsd(price)}</p>}
                  <button type="button" onClick={handleChangeProduct} className="text-xs text-primary underline mt-1">
                    {t('orderNew.changeProduct')}
                  </button>
                </div>
              </div>

              {attributeGroups.length > 0 && (
                <div className="space-y-2.5">
                  {attributeGroups.map((group) => (
                    <div key={group.label}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{group.label}</p>
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
          )}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6">
        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmitClick();
            }}
            className="space-y-4"
          >
            {manualMode && (
              <>
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orderNew.type')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('orderNew.typePlaceholder')} className="h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('orderNew.color')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('orderNew.colorPlaceholder')} className="h-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="size"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('orderNew.size')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('orderNew.sizePlaceholder')} className="h-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="mockupUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orderNew.mockupUrl')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('orderNew.mockupUrlPlaceholder')} className="h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="printMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orderNew.printMethod')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('orderNew.printMethodPlaceholder')} className="h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('orderNew.quantity')}</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} className="h-10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!manualMode &&
              product &&
              printAreas.map((area) => (
                <div key={area.key} className="space-y-2">
                  <label className="text-sm font-medium leading-none">{t('orderNew.designUrl', { area: area.label })}</label>
                  <Input
                    placeholder={t('orderNew.designUrlPlaceholder')}
                    className="h-10"
                    value={designUrls[area.key] ?? ''}
                    onChange={(e) => setDesignUrls((prev) => ({ ...prev, [area.key]: e.target.value }))}
                  />
                </div>
              ))}

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

            <Button type="submit" disabled={loading} className="w-full h-10">
              {loading && <Spinner size={14} className="text-primary-foreground" />}
              {t('orderNew.submit')}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}

export default CustomerOrderNew;
