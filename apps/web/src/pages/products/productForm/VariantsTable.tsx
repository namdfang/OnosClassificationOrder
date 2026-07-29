import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { ProductVariation } from 'shared';
import { Status } from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { VariationGroup } from './variantUtils';
import { computeVariationSku, getAttrValue, isOrphanVariant } from './variantUtils';

interface Props {
  /** Nhóm option ĐÃ làm sạch (`cleanGroups`) — nhóm soạn dở không lọt vào đây. */
  groups: VariationGroup[];
  variants: ProductVariation[];
  /** SKU sản phẩm — prefix quy ước sinh SKU biến thể (`computeVariationSku`). */
  skuPrefix: string;
  onChange: React.Dispatch<React.SetStateAction<ProductVariation[]>>;
  /** Lọc hiển thị theo chọn Batch Edit — undefined = hiện tất cả (index gốc vẫn giữ để update đúng dòng). */
  rowFilter?: (v: ProductVariation) => boolean;
}

const numVal = (v?: number) => (v != null ? String(v) : '');
const parseNum = (s: string): number | undefined => (s === '' ? undefined : Number(s));

interface RowProps {
  v: ProductVariation;
  idx: number;
  groups: VariationGroup[];
  skuPrefix: string;
  /** Cột option đầu gom theo run — false = giá trị lặp với dòng hiển thị phía trên, không in lại. */
  showFirstValue: boolean;
  onUpdate: (idx: number, patch: Partial<ProductVariation>) => void;
  onRemove: (idx: number) => void;
}

/**
 * 1 dòng variant — `React.memo` để gõ giá ô nào chỉ re-render dòng đó (200
 * dòng × ~12 input, không memo là gõ 1 phím cả bảng render lại → lag).
 */
const VariantRow = React.memo(function VariantRow({ v, idx, groups, skuPrefix, showFirstValue, onUpdate, onRemove }: RowProps) {
  const { t } = useTranslation('products');
  const orphan = isOrphanVariant(v, groups);
  const skuPreview = v.sku.trim() || computeVariationSku(skuPrefix, v.attributes || []);

  const priceCell = (field: keyof ProductVariation, value?: number) => (
    <TableCell>
      <Input
        type="number"
        min={0}
        value={numVal(value)}
        onChange={(e) => onUpdate(idx, { [field]: parseNum(e.target.value) } as Partial<ProductVariation>)}
        className="h-8 text-xs"
      />
    </TableCell>
  );

  return (
    <TableRow className={orphan ? 'bg-amber-50 dark:bg-amber-950' : undefined}>
      {groups.map((g, i) => {
        const value = getAttrValue(v, g.name);
        const hidden = i === 0 && !orphan && !showFirstValue;
        return (
          <TableCell key={`${g.name}-${i}`} className="whitespace-nowrap text-sm">
            {hidden ? null : (value ?? <span className="text-muted-foreground">—</span>)}
          </TableCell>
        );
      })}
      <TableCell>
        <div className="flex items-center gap-1.5">
          {orphan && (
            <span title={t('detail.table.orphanTitle')}>
              <AlertTriangle size={14} className="text-amber-600 shrink-0" />
            </span>
          )}
          {/* SKU read-only tự sinh — chỉnh trong database nếu cần khác quy ước. */}
          <div
            className="h-8 flex items-center px-2 rounded-md border border-dashed border-border bg-muted/40 font-mono text-xs text-muted-foreground truncate min-w-0 flex-1"
            title={t('detail.table.skuTitle')}
          >
            {skuPreview || <span className="italic">{t('detail.table.skuMissing')}</span>}
          </div>
        </div>
      </TableCell>
      {priceCell('cost', v.cost)}
      <TableCell>
        {/* Ship costs: EXP US / TIKTOK US */}
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            value={numVal(v.expUsShipCost)}
            onChange={(e) => onUpdate(idx, { expUsShipCost: parseNum(e.target.value) })}
            placeholder="EXP"
            title={t('detail.table.expShipTitle')}
            className="h-8 w-14 text-xs px-1.5"
          />
          <span className="text-muted-foreground text-xs">/</span>
          <Input
            type="number"
            min={0}
            value={numVal(v.tiktokShipCost)}
            onChange={(e) => onUpdate(idx, { tiktokShipCost: parseNum(e.target.value) })}
            placeholder="TT"
            title={t('detail.table.ttShipTitle')}
            className="h-8 w-14 text-xs px-1.5"
          />
        </div>
      </TableCell>
      {priceCell('nonShipCost', v.nonShipCost)}
      {priceCell('wholesalePrice', v.wholesalePrice)}
      {priceCell('retailPrice', v.retailPrice)}
      {priceCell('tiktokPrice', v.tiktokPrice)}
      <TableCell>
        {/* Package: Weight / Width / Height / Length */}
        <div className="flex items-center gap-1">
          <Input type="number" min={0} value={numVal(v.weight)} onChange={(e) => onUpdate(idx, { weight: parseNum(e.target.value) })} placeholder="Wgt" title={t('detail.packaging.weight')} className="h-8 w-16 text-xs px-1.5" />
          <Input type="number" min={0} value={numVal(v.width)} onChange={(e) => onUpdate(idx, { width: parseNum(e.target.value) })} placeholder="W" title={t('detail.packaging.width')} className="h-8 w-14 text-xs px-1.5" />
          <Input type="number" min={0} value={numVal(v.height)} onChange={(e) => onUpdate(idx, { height: parseNum(e.target.value) })} placeholder="H" title={t('detail.packaging.height')} className="h-8 w-14 text-xs px-1.5" />
          <Input type="number" min={0} value={numVal(v.length)} onChange={(e) => onUpdate(idx, { length: parseNum(e.target.value) })} placeholder="L" title={t('detail.packaging.length')} className="h-8 w-14 text-xs px-1.5" />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Switch
            checked={v.status === Status.Active}
            onCheckedChange={(checked) => onUpdate(idx, { status: checked ? Status.Active : Status.Inactive })}
          />
          {v.status !== Status.Active && (
            <Badge variant="outline" className="font-normal text-[10px]">
              {t('detail.variations.stopped')}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemove(idx)}>
          <Trash2 size={14} className="text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
});

/**
 * Bảng variants — cột KHỚP bảng "Variations & Price" hệ cũ:
 * [option cols] | SKU | Cost | EXP US/TIKTOK US | Non-Ship | Wholesale |
 * EXP US $ | TT US $ | Package | Active. Dòng mồ côi tô amber.
 * Update qua functional setState + row memo → gõ phím không render cả bảng.
 */
export function VariantsTable({ groups, variants, skuPrefix, onChange, rowFilter }: Props) {
  const { t } = useTranslation('products');

  const update = useCallback(
    (idx: number, patch: Partial<ProductVariation>) =>
      onChange((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v))),
    [onChange],
  );
  const remove = useCallback((idx: number) => onChange((prev) => prev.filter((_, i) => i !== idx)), [onChange]);

  /** Dòng hiển thị (đã lọc theo Batch Edit) — giữ index GỐC để update/xóa đúng dòng. */
  const visible = useMemo(() => {
    const list: Array<{ v: ProductVariation; idx: number }> = [];
    variants.forEach((v, idx) => {
      if (!rowFilter || rowFilter(v)) list.push({ v, idx });
    });
    return list;
  }, [variants, rowFilter]);

  if (variants.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">{t('detail.table.empty')}</p>;
  }

  const colSpan = groups.length + 10;

  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {groups.map((g, i) => (
              <TableHead key={`${g.name}-${i}`} className="whitespace-nowrap uppercase min-w-[110px]">
                {g.name || t('detail.table.optionFallback', { index: i + 1 })}
              </TableHead>
            ))}
            <TableHead className="min-w-[170px]">SKU</TableHead>
            <TableHead className="min-w-[80px]">{t('detail.table.cost')}</TableHead>
            <TableHead className="min-w-[130px] whitespace-nowrap">{t('detail.table.shipCosts')}</TableHead>
            <TableHead className="min-w-[80px]">{t('detail.table.nonShip')}</TableHead>
            <TableHead className="min-w-[80px]">{t('detail.table.wholesale')}</TableHead>
            <TableHead className="min-w-[80px]">{t('detail.table.expUsPrice')}</TableHead>
            <TableHead className="min-w-[80px]">{t('detail.table.ttUsPrice')}</TableHead>
            <TableHead className="min-w-[280px]">{t('detail.table.package')}</TableHead>
            <TableHead className="whitespace-nowrap">{t('detail.table.active')}</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center py-6 text-xs text-muted-foreground">
                {t('detail.batchEdit.noMatch')}
              </TableCell>
            </TableRow>
          )}
          {visible.map(({ v, idx }, i) => {
            const firstGroup = groups[0];
            const prev = visible[i - 1]?.v;
            const showFirstValue =
              !firstGroup || !prev || getAttrValue(prev, firstGroup.name) !== getAttrValue(v, firstGroup.name);
            return (
              <VariantRow
                key={idx}
                v={v}
                idx={idx}
                groups={groups}
                skuPrefix={skuPrefix}
                showFirstValue={showFirstValue}
                onUpdate={update}
                onRemove={remove}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
