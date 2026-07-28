import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import type { VariationGroup } from './variantUtils';
import { buildCombos, VARIANT_GROUP_MAX, VARIANTS_MAX } from './variantUtils';

interface Dim {
  label: string;
  /** Danh sách giá trị cách nhau dấu phẩy (VD: "Đỏ, Xanh, Vàng"). */
  values: string;
}

interface Props {
  /** Nhóm option hiện có ĐÃ làm sạch — dims tạo nhanh nối vào sau các nhóm này. */
  existingGroups: VariationGroup[];
  /** Nhận danh sách nhóm mới hợp lệ — parent nối vào groups + regenerate bảng. */
  onGenerate: (dims: VariationGroup[]) => void;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Gợi ý tên + ví dụ giá trị theo thứ tự thường gặp — dòng 4 trở đi dùng nhãn chung. */
const getDimPlaceholder = (t: TFunction<'products'>, idx: number) => {
  const presets = [
    { label: t('detail.attributes.sizeLabel'), values: t('detail.bulkGenerate.sizeValuesExample') },
    { label: t('detail.attributes.colorLabel'), values: t('detail.bulkGenerate.colorValuesExample') },
    { label: t('detail.attributes.typeLabel'), values: t('detail.bulkGenerate.typeValuesExample') },
  ];
  return presets[idx] || { label: t('detail.attributes.genericLabel'), values: t('detail.bulkGenerate.genericValuesExample') };
};

/**
 * Popover "Tạo nhanh biến thể" (mirror hệ cũ): mỗi dòng 1 thuộc tính (tên +
 * danh sách giá trị cách nhau dấu phẩy) → bấm tạo là các dòng thành NHÓM
 * option nối vào sau nhóm hiện có, bảng variants tự sinh tổ hợp cartesian
 * (diff-preserve ở parent — không mất giá đã nhập).
 */
export function BulkGeneratePopover({ existingGroups, onGenerate }: Props) {
  const { t } = useTranslation('products');
  const [open, setOpen] = useState(false);
  const [dims, setDims] = useState<Dim[]>([{ label: '', values: '' }]);

  const updateDim = (idx: number, patch: Partial<Dim>) =>
    setDims((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  const removeDim = (idx: number) => setDims((prev) => prev.filter((_, i) => i !== idx));

  /** Parse dims đang nhập thành nhóm (bỏ dòng trống hoàn toàn, uniq giá trị). */
  const parseDims = (): VariationGroup[] =>
    dims
      .map((d) => {
        const seen = new Set<string>();
        const options: string[] = [];
        for (const raw of d.values.split(/[,\n]/)) {
          const v = raw.trim();
          if (v && !seen.has(norm(v))) {
            seen.add(norm(v));
            options.push(v);
          }
        }
        return { name: d.label.trim(), options };
      })
      .filter((d) => d.name || d.options.length > 0);

  const parsed = parseDims();
  const complete = parsed.filter((d) => d.name && d.options.length > 0);
  const previewCount =
    complete.length === parsed.length && complete.length > 0 ? buildCombos([...existingGroups, ...complete]).length : 0;

  const handleGenerate = () => {
    const missingName = parsed.find((d) => !d.name);
    if (missingName) {
      toast.error(t('detail.groups.needName'));
      return;
    }
    const missingValues = parsed.find((d) => d.options.length === 0);
    if (missingValues) {
      toast.error(t('detail.groups.emptyGroup', { name: missingValues.name }));
      return;
    }
    if (parsed.length === 0) return;
    const names = [...existingGroups.map((g) => g.name), ...parsed.map((d) => d.name)];
    const dup = names.find((n, i) => names.some((x, j) => j < i && norm(x) === norm(n)));
    if (dup) {
      toast.error(t('detail.groups.duplicateName', { name: dup }));
      return;
    }
    if (existingGroups.length + parsed.length > VARIANT_GROUP_MAX) {
      toast.error(t('detail.groups.maxGroups', { max: VARIANT_GROUP_MAX }));
      return;
    }
    const comboCount = buildCombos([...existingGroups, ...parsed]).length;
    if (comboCount > VARIANTS_MAX) {
      toast.error(t('detail.groups.tooMany', { count: comboCount, max: VARIANTS_MAX }));
      return;
    }

    onGenerate(parsed);
    setDims([{ label: '', values: '' }]);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles size={14} /> {t('detail.bulkGenerate.trigger')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-2" align="start">
        <p className="text-sm font-semibold text-foreground">{t('detail.bulkGenerate.title')}</p>
        <p className="text-xs text-muted-foreground">{t('detail.bulkGenerate.description')}</p>
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {dims.map((d, idx) => {
            const ph = getDimPlaceholder(t, idx);
            return (
              <div key={idx} className="flex items-center gap-1.5">
                <Input
                  value={d.label}
                  onChange={(e) => updateDim(idx, { label: e.target.value })}
                  placeholder={ph.label}
                  className="h-9 text-xs w-24 shrink-0"
                />
                <Input
                  value={d.values}
                  onChange={(e) => updateDim(idx, { values: e.target.value })}
                  placeholder={ph.values}
                  className="h-9 text-xs flex-1"
                />
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeDim(idx)}>
                  <Trash2 size={13} className="text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={existingGroups.length + dims.length >= VARIANT_GROUP_MAX}
            onClick={() => setDims((prev) => [...prev, { label: '', values: '' }])}
          >
            <Plus size={13} /> {t('detail.bulkGenerate.addAttribute')}
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={previewCount === 0}>
            {previewCount > 0 ? t('detail.bulkGenerate.generateCount', { count: previewCount }) : t('detail.bulkGenerate.generate')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
