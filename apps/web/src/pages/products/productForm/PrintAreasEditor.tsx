import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ProductPrintArea } from 'shared';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** 18 vị trí in — khớp khóa DesignFields của đơn hàng (cột design_<key> khi lên đơn CSV). */
export const PRINT_AREA_LABELS: Record<string, string> = {
  front: 'Front',
  back: 'Back',
  sleeve: 'Sleeve',
  hood: 'Hood',
  folder: 'Folder',
  placket: 'Placket',
  chestLeft: 'Left Chest',
  chestRight: 'Right Chest',
  left: 'Left',
  right: 'Right',
  sleeveLeft: 'Left Sleeve',
  sleeveRight: 'Right Sleeve',
  leftUpperSleeve: 'Left Upper Sleeve',
  rightUpperSleeve: 'Right Upper Sleeve',
  leftCuff: 'Left Cuff',
  rightCuff: 'Right Cuff',
  frontEmbroidery: 'Front Embroidery',
  backEmbroidery: 'Back Embroidery',
};

const PRINT_AREA_KEYS = Object.keys(PRINT_AREA_LABELS) as ProductPrintArea['key'][];

const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface Props {
  printAreas: ProductPrintArea[];
  onChange: (areas: ProductPrintArea[]) => void;
}

/**
 * Editor vị trí in structured — mỗi vị trí: key (∈ 18 khóa DesignFields, không
 * trùng), tên hiển thị, template PSD, kích thước px, cờ bắt buộc/thêu. Đây là
 * nền validate cột design_* khi khách lên đơn CSV (phase sau).
 */
export function PrintAreasEditor({ printAreas, onChange }: Props) {
  const usedKeys = new Set(printAreas.map((a) => a.key));

  const addArea = () => {
    const free = PRINT_AREA_KEYS.find((k) => !usedKeys.has(k));
    if (!free) {
      toast.error('All 18 print areas are already in use');
      return;
    }
    onChange([...printAreas, { key: free, name: PRINT_AREA_LABELS[free], isRequired: false, isEmbroidery: free.includes('Embroidery') }]);
  };

  const update = (idx: number, patch: Partial<ProductPrintArea>) =>
    onChange(printAreas.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  const remove = (idx: number) => onChange(printAreas.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Each key maps to the <code className="font-mono">design_&lt;key&gt;</code> column in CSV/API ordering (e.g. key{' '}
          <code className="font-mono">front</code> → column <code className="font-mono">design_front</code>).
        </p>
        <Button variant="outline" size="sm" onClick={addArea}>
          <Plus size={14} /> Add print area
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-3 items-start">
        {printAreas.map((a, idx) => (
          <div key={`${a.key}-${idx}`} className="rounded-md border border-border p-2.5 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Position (key)</Label>
                <select
                  value={a.key}
                  onChange={(e) => {
                    const key = e.target.value as ProductPrintArea['key'];
                    update(idx, {
                      key,
                      // Tên đang là label mặc định của key cũ → đổi theo key mới; tên user tự gõ giữ nguyên.
                      ...(a.name === PRINT_AREA_LABELS[a.key] ? { name: PRINT_AREA_LABELS[key] } : {}),
                    });
                  }}
                  className={selectCls}
                >
                  {PRINT_AREA_KEYS.filter((k) => k === a.key || !usedKeys.has(k)).map((k) => (
                    <option key={k} value={k}>
                      {PRINT_AREA_LABELS[k]} (design_{k})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Display name</Label>
                <Input value={a.name} onChange={(e) => update(idx, { name: e.target.value })} className="h-9" />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_90px_90px] gap-2">
              <div className="space-y-1">
                <Label className="text-xs">PSD template (URL)</Label>
                <Input
                  value={a.templateUrl || ''}
                  onChange={(e) => update(idx, { templateUrl: e.target.value || undefined })}
                  placeholder="https://drive.google.com/…"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Width (px)</Label>
                <Input
                  type="number"
                  min={0}
                  value={a.widthPx ?? ''}
                  onChange={(e) => update(idx, { widthPx: e.target.value ? Number(e.target.value) : undefined })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Height (px)</Label>
                <Input
                  type="number"
                  min={0}
                  value={a.heightPx ?? ''}
                  onChange={(e) => update(idx, { heightPx: e.target.value ? Number(e.target.value) : undefined })}
                  className="h-9"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={a.isRequired} onCheckedChange={(v) => update(idx, { isRequired: v })} />
                  Design required
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={a.isEmbroidery} onCheckedChange={(v) => update(idx, { isEmbroidery: v })} />
                  Embroidery area (.png)
                </label>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(idx)}>
                <Trash2 size={14} className="text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        {printAreas.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 md:col-span-2">No print areas defined yet.</p>
        )}
      </div>
    </div>
  );
}
