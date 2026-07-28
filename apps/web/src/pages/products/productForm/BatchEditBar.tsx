import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, X } from 'lucide-react';
import type { ProductVariation } from 'shared';
import { Status } from 'shared';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import type { VariationGroup } from './variantUtils';

interface Props {
  /** Nhóm option ĐÃ làm sạch (`cleanGroups`) — thẳng hàng với `selected`. */
  groups: VariationGroup[];
  /** Bộ chọn từng nhóm (Set rỗng = All) — parent giữ để lọc bảng theo thời gian thực. */
  selected: Array<Set<string>>;
  onSelectedChange: (next: Array<Set<string>>) => void;
  matchedCount: number;
  total: number;
  onApply: (patch: Partial<ProductVariation>) => void;
}

interface FieldState {
  cost: string;
  nonShipCost: string;
  wholesalePrice: string;
  retailPrice: string;
  tiktokPrice: string;
  expUsShipCost: string;
  tiktokShipCost: string;
  weight: string;
  width: string;
  height: string;
  length: string;
  status: '' | typeof Status.Active | typeof Status.Inactive;
}

const EMPTY_FIELDS: FieldState = {
  cost: '',
  nonShipCost: '',
  wholesalePrice: '',
  retailPrice: '',
  tiktokPrice: '',
  expUsShipCost: '',
  tiktokShipCost: '',
  weight: '',
  width: '',
  height: '',
  length: '',
  status: '',
};

/** Field số áp theo batch — key trùng tên field trên ProductVariation, nhãn = i18n `detail.batchEdit.fields.*`. */
const NUMERIC_FIELDS: Array<keyof FieldState & keyof ProductVariation> = [
  'cost',
  'expUsShipCost',
  'tiktokShipCost',
  'nonShipCost',
  'wholesalePrice',
  'retailPrice',
  'tiktokPrice',
  'weight',
  'width',
  'height',
  'length',
];

const selectCls =
  'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Multi-select 1 nhóm option — trigger "All - {tên}" / "{n} - {tên}", nội dung checkbox. */
function GroupMultiSelect({
  group,
  selected,
  onToggle,
}: {
  group: VariationGroup;
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const { t } = useTranslation('products');
  const label =
    selected.size === 0
      ? t('detail.batchEdit.allOf', { name: group.name })
      : t('detail.batchEdit.someOf', { count: selected.size, name: group.name });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 font-normal">
          {label} <ChevronDown size={14} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 space-y-0.5" align="start">
        {group.options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
            <input type="checkbox" checked={selected.has(o)} onChange={() => onToggle(o)} className="rounded border-input" />
            {o}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Thanh Batch Edit INLINE trên bảng variants (thay dialog): multi-select từng
 * nhóm option (chọn tới đâu bảng dưới lọc tới đó — logic lọc ở parent), dãy ô
 * giá/phí (state CỤC BỘ — gõ không re-render trang), Apply + Clear. Ô bỏ
 * trống = giữ nguyên giá trị cũ từng dòng.
 */
export function BatchEditBar({ groups, selected, onSelectedChange, matchedCount, total, onApply }: Props) {
  const { t } = useTranslation(['products', 'common']);
  const [fields, setFields] = useState<FieldState>(EMPTY_FIELDS);

  const toggle = (groupIdx: number, value: string) => {
    onSelectedChange(
      selected.map((set, i) => {
        if (i !== groupIdx) return set;
        const next = new Set(set);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      }),
    );
  };

  const hasValues = NUMERIC_FIELDS.some((k) => fields[k] !== '') || fields.status !== '';
  const hasSelection = selected.some((s) => s.size > 0);

  const handleApply = () => {
    const patch: Partial<ProductVariation> = {};
    for (const key of NUMERIC_FIELDS) {
      const raw = fields[key];
      if (raw !== '') (patch as Record<string, unknown>)[key] = Number(raw);
    }
    if (fields.status) patch.status = fields.status;
    if (matchedCount === 0) {
      toast.error(t('detail.batchEdit.noMatch'));
      return;
    }
    onApply(patch);
  };

  const handleClear = () => {
    setFields(EMPTY_FIELDS);
    onSelectedChange(groups.map(() => new Set<string>()));
  };

  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((g, i) => (
          <GroupMultiSelect key={`${g.name}-${i}`} group={g} selected={selected[i] || new Set()} onToggle={(v) => toggle(i, v)} />
        ))}
        {NUMERIC_FIELDS.map((key) => (
          <Input
            key={key}
            type="number"
            min={0}
            value={fields[key]}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            placeholder={t(`detail.batchEdit.fields.${key}`)}
            className="h-9 w-[100px] text-xs"
          />
        ))}
        <select
          value={fields.status}
          onChange={(e) => setFields({ ...fields, status: e.target.value as FieldState['status'] })}
          className={selectCls}
        >
          <option value="">{t('detail.batchEdit.statusKeep')}</option>
          <option value={Status.Active}>{t('detail.variations.selling')}</option>
          <option value={Status.Inactive}>{t('detail.variations.stopped')}</option>
        </select>
        <Button size="sm" className="h-9" onClick={handleApply} disabled={!hasValues}>
          {t('detail.batchEdit.apply', { count: matchedCount })}
        </Button>
        {(hasValues || hasSelection) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={handleClear}>
            <X size={14} /> {t('detail.batchEdit.clear')}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t('detail.batchEdit.matches')} <span className="font-semibold text-foreground tabular-nums">{matchedCount}</span>/{total} ·{' '}
        {t('detail.batchEdit.valuesHint')}
      </p>
    </div>
  );
}
