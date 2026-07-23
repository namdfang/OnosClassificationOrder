import React, { useEffect, useState } from 'react';
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

const DISCOUNT_TYPE_LABEL: Record<PromotionDiscountType, string> = {
  percentage: '% giảm giá',
  fixed: 'Giảm số tiền cố định',
};

const SCOPE_LABEL: Record<PromotionScope, string> = {
  all: 'Toàn bộ sản phẩm',
  category: 'Theo danh mục',
  product: 'Sản phẩm cụ thể',
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: Promotion | null;
  productOptions: ProductConfigOption[];
  categoryOptions: ProductCategoryOption[];
  onSaved: () => void;
}

export function PromotionEditDialog({ open, onOpenChange, item, productOptions, categoryOptions, onSaved }: Props) {
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
      toast.error('Nhập tên chương trình');
      return;
    }
    if (!discountValue) {
      toast.error('Nhập giá trị giảm giá');
      return;
    }
    if (scope === 'category' && !scopeCategoryId) {
      toast.error('Chọn danh mục áp dụng');
      return;
    }
    if (scope === 'product' && scopeProductConfigIds.length === 0) {
      toast.error('Chọn ít nhất 1 sản phẩm áp dụng');
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
        toast.success('Đã cập nhật chương trình giảm giá');
      } else {
        await RepositoryRemote.promotion.createPromotion(payload);
        toast.success('Đã tạo chương trình giảm giá');
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
          <DialogTitle>{item ? 'Sửa chương trình giảm giá' : 'Tạo chương trình giảm giá'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tên chương trình</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Giảm giá khách VIP" />
            </div>
            <div className="space-y-1.5">
              <Label>Mã coupon (tuỳ chọn)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VD: VIP10" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Mô tả</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Loại giảm giá</Label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as PromotionDiscountType)} className={selectCls}>
                {PROMOTION_DISCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DISCOUNT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Giá trị {discountType === 'percentage' ? '(%)' : '(VNĐ)'}</Label>
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
            <Label>Phạm vi áp dụng</Label>
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
              <Label>Danh mục sản phẩm</Label>
              <select value={scopeCategoryId} onChange={(e) => setScopeCategoryId(e.target.value)} className={selectCls}>
                <option value="">— Chưa chọn —</option>
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
              <Label>Sản phẩm áp dụng ({scopeProductConfigIds.length} đã chọn)</Label>
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
                {productOptions.length === 0 && <p className="text-xs text-muted-foreground">Chưa có sản phẩm nào.</p>}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tier khách hàng áp dụng (bỏ trống = mọi tier, kể cả khách lẻ)</Label>
            <div className="flex flex-wrap gap-2">
              {CUSTOMER_TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTier(t)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    applicableTiers.includes(t)
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400',
                  )}
                >
                  VIP {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>SL tối thiểu</Label>
              <Input type="number" min={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bắt đầu</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Kết thúc</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label className="!mb-0">{active ? 'Đang hoạt động' : 'Tạm tắt'}</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Spinner size={14} />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
