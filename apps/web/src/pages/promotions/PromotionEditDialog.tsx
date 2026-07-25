import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { CreatePromotionDto, Promotion, PromotionDiscountType, PromotionScope } from 'shared';
import { CUSTOMER_TIERS, PROMOTION_DISCOUNT_TYPES, PROMOTION_SCOPES, Status } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import type { ProductCategoryOption, ProductConfigOption } from './index';

const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const buildDiscountTypeLabel = (t: TFunction<['promotion', 'common']>): Record<PromotionDiscountType, string> => ({
  percentage: t('editDialog.discountType.percentage'),
  fixed: t('editDialog.discountType.fixed'),
});

const buildScopeLabel = (t: TFunction<['promotion', 'common']>): Record<PromotionScope, string> => ({
  all: t('editDialog.scope.all'),
  category: t('editDialog.scope.category'),
  product: t('editDialog.scope.product'),
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: Promotion | null;
  productOptions: ProductConfigOption[];
  categoryOptions: ProductCategoryOption[];
  onSaved: () => void;
}

export function PromotionEditDialog({ open, onOpenChange, item, productOptions, categoryOptions, onSaved }: Props) {
  const { t } = useTranslation(['promotion', 'common']);
  const DISCOUNT_TYPE_LABEL = useMemo(() => buildDiscountTypeLabel(t), [t]);
  const SCOPE_LABEL = useMemo(() => buildScopeLabel(t), [t]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<PromotionDiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [scope, setScope] = useState<PromotionScope>('all');
  const [scopeCategoryId, setScopeCategoryId] = useState('');
  const [scopeProductConfigIds, setScopeProductConfigIds] = useState<string[]>([]);
  const [applicableTiers, setApplicableTiers] = useState<number[]>([]);
  const [minQuantity, setMinQuantity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name || '');
    setCode(item?.code || '');
    setDescription(item?.description || '');
    setDiscountType(item?.discountType || 'percentage');
    setDiscountValue(item?.discountValue != null ? String(item.discountValue) : '');
    setScope(item?.scope || 'all');
    setScopeCategoryId(item?.scopeCategoryId || '');
    setScopeProductConfigIds(item?.scopeProductConfigIds || []);
    setApplicableTiers(item?.applicableTiers || []);
    setMinQuantity(item?.minQuantity != null ? String(item.minQuantity) : '');
    setStartDate(item?.startDate ? String(item.startDate).slice(0, 10) : '');
    setEndDate(item?.endDate ? String(item.endDate).slice(0, 10) : '');
    setActive(item ? item.status === Status.Active : true);
  }, [open, item]);

  const toggleTier = (t: number) => {
    setApplicableTiers((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const toggleProduct = (id: string) => {
    setScopeProductConfigIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('editDialog.nameRequired'));
      return;
    }
    if (!discountValue) {
      toast.error(t('editDialog.discountValueRequired'));
      return;
    }
    if (scope === 'category' && !scopeCategoryId) {
      toast.error(t('editDialog.categoryRequired'));
      return;
    }
    if (scope === 'product' && scopeProductConfigIds.length === 0) {
      toast.error(t('editDialog.productRequired'));
      return;
    }

    const payload: CreatePromotionDto = {
      name: name.trim(),
      code: code.trim() || undefined,
      description: description.trim() || undefined,
      discountType,
      discountValue: Number(discountValue),
      scope,
      scopeCategoryId: scope === 'category' ? scopeCategoryId : undefined,
      scopeProductConfigIds: scope === 'product' ? scopeProductConfigIds : undefined,
      applicableTiers: applicableTiers.length ? applicableTiers : undefined,
      minQuantity: minQuantity ? Number(minQuantity) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status: active ? Status.Active : Status.Inactive,
    };

    try {
      setSaving(true);
      if (item) {
        await RepositoryRemote.promotion.updatePromotion(String(item._id), payload);
        toast.success(t('editDialog.updateSuccess'));
      } else {
        await RepositoryRemote.promotion.createPromotion(payload);
        toast.success(t('editDialog.createSuccess'));
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? t('editDialog.editTitle') : t('editDialog.createTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('editDialog.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('editDialog.namePlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('editDialog.code')}</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('editDialog.codePlaceholder')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('editDialog.description')}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('editDialog.discountTypeLabel')}</Label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as PromotionDiscountType)} className={selectCls}>
                {PROMOTION_DISCOUNT_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {DISCOUNT_TYPE_LABEL[dt]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>
                {t('editDialog.discountValue')} {discountType === 'percentage' ? '(%)' : '(VNĐ)'}
              </Label>
              <Input
                type="number"
                min={0}
                max={discountType === 'percentage' ? 100 : undefined}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('editDialog.scopeLabel')}</Label>
            <select value={scope} onChange={(e) => setScope(e.target.value as PromotionScope)} className={selectCls}>
              {PROMOTION_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          {scope === 'category' && (
            <div className="space-y-1.5">
              <Label>{t('editDialog.productCategory')}</Label>
              <select value={scopeCategoryId} onChange={(e) => setScopeCategoryId(e.target.value)} className={selectCls}>
                <option value="">{t('editDialog.notSelected')}</option>
                {categoryOptions.map((opt) => (
                  <option key={opt._id} value={opt._id}>
                    {opt.shortName} · {opt.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'product' && (
            <div className="space-y-1.5">
              <Label>{t('editDialog.applicableProducts', { count: scopeProductConfigIds.length })}</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2 space-y-1">
                {productOptions.map((p) => (
                  <label key={p._id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scopeProductConfigIds.includes(p._id)}
                      onChange={() => toggleProduct(p._id)}
                    />
                    {p.fullName} <span className="text-muted-foreground text-xs">({p.shortName})</span>
                  </label>
                ))}
                {productOptions.length === 0 && <p className="text-xs text-muted-foreground">{t('editDialog.noProducts')}</p>}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('editDialog.applicableTiers')}</Label>
            <div className="flex flex-wrap gap-2">
              {CUSTOMER_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => toggleTier(tier)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    applicableTiers.includes(tier)
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400',
                  )}
                >
                  VIP {tier}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t('editDialog.minQuantity')}</Label>
              <Input type="number" min={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('editDialog.startDate')}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('editDialog.endDate')}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label className="!mb-0">{active ? t('editDialog.active') : t('editDialog.inactive')}</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Spinner size={14} />}
            {t('common:actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
