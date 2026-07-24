import React, { useState } from 'react';
import type { ProductVariation } from 'shared';
import { Status } from 'shared';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { VariationGroup } from './variantUtils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups: VariationGroup[];
  variants: ProductVariation[];
  onApply: (variants: ProductVariation[]) => void;
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

/** Field số áp theo batch — key trùng tên field trên ProductVariation. */
const NUMERIC_FIELDS: Array<{ key: keyof FieldState & keyof ProductVariation; placeholder: string }> = [
  { key: 'cost', placeholder: 'Cost' },
  { key: 'expUsShipCost', placeholder: 'EXP US ship' },
  { key: 'tiktokShipCost', placeholder: 'TIKTOK US ship' },
  { key: 'nonShipCost', placeholder: 'Non-Ship' },
  { key: 'wholesalePrice', placeholder: 'Wholesale' },
  { key: 'retailPrice', placeholder: 'EXP US $' },
  { key: 'tiktokPrice', placeholder: 'TT US $' },
  { key: 'weight', placeholder: 'Weight (g)' },
  { key: 'width', placeholder: 'Width (cm)' },
  { key: 'height', placeholder: 'Height (cm)' },
  { key: 'length', placeholder: 'Length (cm)' },
];

const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * Sửa hàng loạt variants: lọc theo giá trị option từng nhóm (bỏ trống nhóm =
 * mọi giá trị), live count số dòng khớp. Ô GIÁ/PHÍ BỎ TRỐNG = GIỮ NGUYÊN giá
 * trị cũ — chỉ ghi đè ô có nhập.
 */
export function BatchEditDialog({ open, onOpenChange, groups, variants, onApply }: Props) {
  // Mỗi nhóm 1 Set giá trị đã chọn (rỗng = tất cả).
  const [selected, setSelected] = useState<Array<Set<string>>>([]);
  const [fields, setFields] = useState<FieldState>(EMPTY_FIELDS);

  React.useEffect(() => {
    if (open) {
      setSelected(groups.map(() => new Set()));
      setFields(EMPTY_FIELDS);
    }
  }, [open, groups]);

  const toggle = (groupIdx: number, value: string) => {
    setSelected((prev) =>
      prev.map((set, i) => {
        if (i !== groupIdx) return set;
        const next = new Set(set);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      }),
    );
  };

  const matches = (v: ProductVariation): boolean =>
    groups.every((_, i) => {
      const sel = selected[i];
      if (!sel || sel.size === 0) return true;
      const val = v.options?.[i];
      return val != null && sel.has(val);
    });

  const matchedCount = variants.filter(matches).length;

  const handleApply = () => {
    const patch: Partial<ProductVariation> = {};
    for (const f of NUMERIC_FIELDS) {
      const raw = fields[f.key];
      if (raw !== '') (patch as Record<string, unknown>)[f.key] = Number(raw);
    }
    if (fields.status) patch.status = fields.status;

    if (Object.keys(patch).length === 0) {
      toast.error('No values entered to apply');
      return;
    }
    if (matchedCount === 0) {
      toast.error('No variants match the filter');
      return;
    }

    onApply(variants.map((v) => (matches(v) ? { ...v, ...patch } : v)));
    toast.success(`Applied to ${matchedCount} variants`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Batch edit variants</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Filter by option — leave a group empty to match all of its values
            </Label>
            {groups.map((g, i) => (
              <div key={`${g.name}-${i}`} className="space-y-1">
                <p className="text-xs font-medium">{g.name || `Option ${i + 1}`}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.options.map((o) => {
                    const active = selected[i]?.has(o);
                    return (
                      <button key={o} type="button" onClick={() => toggle(i, o)}>
                        <Badge variant={active ? 'default' : 'outline'} className="cursor-pointer font-normal">
                          {o}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Matches <span className="font-semibold text-foreground tabular-nums">{matchedCount}</span>/{variants.length} variants
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">New values — EMPTY fields keep their current values</Label>
            <div className="grid grid-cols-3 gap-2">
              {NUMERIC_FIELDS.map((f) => (
                <Input
                  key={f.key}
                  type="number"
                  min={0}
                  value={fields[f.key]}
                  onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                />
              ))}
            </div>
            <select
              value={fields.status}
              onChange={(e) => setFields({ ...fields, status: e.target.value as FieldState['status'] })}
              className={selectCls}
            >
              <option value="">Sale status — keep unchanged</option>
              <option value={Status.Active}>Active</option>
              <option value={Status.Inactive}>Inactive</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply ({matchedCount})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
