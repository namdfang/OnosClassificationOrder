import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { ProductVariation } from 'shared';
import { Status } from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { VariationGroup } from './variantUtils';
import { isOrphanVariant } from './variantUtils';

interface Props {
  groups: VariationGroup[];
  variants: ProductVariation[];
  onChange: (variants: ProductVariation[]) => void;
}

const numVal = (v?: number) => (v != null ? String(v) : '');
const parseNum = (s: string): number | undefined => (s === '' ? undefined : Number(s));

/**
 * Bảng variants — cột KHỚP bảng "Variations & Price" hệ cũ:
 * [option cols] | SKU | Cost | EXP US/TIKTOK US | Non-Ship | Wholesale |
 * EXP US $ | TT US $ | Package (Weight/Width/Height/Length).
 * "EXP US/TIKTOK US" = 2 phí ship (hệ cũ auto từ onosexpress, giờ nhập tay).
 * Dòng "mồ côi" (không khớp bộ option hiện tại) tô amber, user tự quyết xóa.
 */
export function VariantsTable({ groups, variants, onChange }: Props) {
  const update = (idx: number, patch: Partial<ProductVariation>) =>
    onChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  const remove = (idx: number) => onChange(variants.filter((_, i) => i !== idx));

  if (variants.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6">
        No variants yet — add options in the groups on the left, then click "Generate variants".
      </p>
    );
  }

  const priceCell = (idx: number, field: keyof ProductVariation, value?: number) => (
    <TableCell>
      <Input
        type="number"
        min={0}
        value={numVal(value)}
        onChange={(e) => update(idx, { [field]: parseNum(e.target.value) } as Partial<ProductVariation>)}
        className="h-8 text-xs"
      />
    </TableCell>
  );

  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {groups.map((g, i) => (
              <TableHead key={`${g.name}-${i}`} className="whitespace-nowrap">
                {g.name || `Option ${i + 1}`}
              </TableHead>
            ))}
            <TableHead className="min-w-[170px]">SKU</TableHead>
            <TableHead className="min-w-[80px]">Cost</TableHead>
            <TableHead className="min-w-[130px] whitespace-nowrap">EXP US/TIKTOK US</TableHead>
            <TableHead className="min-w-[80px]">Non-Ship</TableHead>
            <TableHead className="min-w-[80px]">Wholesale</TableHead>
            <TableHead className="min-w-[80px]">EXP US $</TableHead>
            <TableHead className="min-w-[80px]">TT US $</TableHead>
            <TableHead className="min-w-[280px]">Package</TableHead>
            <TableHead className="whitespace-nowrap">Active</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((v, idx) => {
            const orphan = isOrphanVariant(v, groups);
            return (
              <TableRow key={idx} className={orphan ? 'bg-amber-50 dark:bg-amber-950' : undefined}>
                {groups.map((g, i) => (
                  <TableCell key={`${g.name}-${i}`} className="whitespace-nowrap text-sm">
                    {v.options?.[i] ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {orphan && (
                      <span title="Does not match the current option set — fix the options or remove this row">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                      </span>
                    )}
                    <Input
                      value={v.sku}
                      onChange={(e) => update(idx, { sku: e.target.value.toUpperCase() })}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </TableCell>
                {priceCell(idx, 'cost', v.cost)}
                <TableCell>
                  {/* Ship costs: EXP US / TIKTOK US */}
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      value={numVal(v.expUsShipCost)}
                      onChange={(e) => update(idx, { expUsShipCost: parseNum(e.target.value) })}
                      placeholder="EXP"
                      title="Express US shipping cost"
                      className="h-8 w-14 text-xs px-1.5"
                    />
                    <span className="text-muted-foreground text-xs">/</span>
                    <Input
                      type="number"
                      min={0}
                      value={numVal(v.tiktokShipCost)}
                      onChange={(e) => update(idx, { tiktokShipCost: parseNum(e.target.value) })}
                      placeholder="TT"
                      title="TikTok (SBTT) shipping cost"
                      className="h-8 w-14 text-xs px-1.5"
                    />
                  </div>
                </TableCell>
                {priceCell(idx, 'nonShipCost', v.nonShipCost)}
                {priceCell(idx, 'wholesalePrice', v.wholesalePrice)}
                {priceCell(idx, 'retailPrice', v.retailPrice)}
                {priceCell(idx, 'tiktokPrice', v.tiktokPrice)}
                <TableCell>
                  {/* Package: Weight / Width / Height / Length */}
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} value={numVal(v.weight)} onChange={(e) => update(idx, { weight: parseNum(e.target.value) })} placeholder="Wgt" title="Weight (g)" className="h-8 w-16 text-xs px-1.5" />
                    <Input type="number" min={0} value={numVal(v.width)} onChange={(e) => update(idx, { width: parseNum(e.target.value) })} placeholder="W" title="Width (cm)" className="h-8 w-14 text-xs px-1.5" />
                    <Input type="number" min={0} value={numVal(v.height)} onChange={(e) => update(idx, { height: parseNum(e.target.value) })} placeholder="H" title="Height (cm)" className="h-8 w-14 text-xs px-1.5" />
                    <Input type="number" min={0} value={numVal(v.length)} onChange={(e) => update(idx, { length: parseNum(e.target.value) })} placeholder="L" title="Length (cm)" className="h-8 w-14 text-xs px-1.5" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={v.status === Status.Active}
                      onCheckedChange={(checked) => update(idx, { status: checked ? Status.Active : Status.Inactive })}
                    />
                    {v.status !== Status.Active && (
                      <Badge variant="outline" className="font-normal text-[10px]">
                        Off
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(idx)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
