import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { VariationGroup } from './variantUtils';

interface Props {
  group: VariationGroup;
  /** Lỗi từ parent (VD trùng tên nhóm) — hiện đỏ dưới input tên. */
  error?: string;
  onChange: (patch: Partial<VariationGroup>) => void;
  onRemove: () => void;
}

/**
 * Quản lý 1 nhóm variant tự định nghĩa: tên nhóm (VD "Color") + danh sách
 * option (chip, thêm bằng Enter / dấu phẩy, hỗ trợ dán "Red, Blue, Green").
 * Collapse được khi đã nhập xong để form gọn.
 */
export function VariationItem({ group, error, onChange, onRemove }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');

  const addOptions = (raw: string) => {
    const values = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!values.length) return;
    const next = [...group.options];
    let dup = 0;
    for (const v of values) {
      if (next.some((o) => o.toLowerCase() === v.toLowerCase())) {
        dup++;
        continue;
      }
      next.push(v);
    }
    if (dup) toast.warning(`Skipped ${dup} duplicate option${dup > 1 ? 's' : ''}`);
    if (next.length !== group.options.length) onChange({ options: next });
    setDraft('');
  };

  const removeOption = (idx: number) => onChange({ options: group.options.filter((_, i) => i !== idx) });

  return (
    <div className={`rounded-md border p-2.5 space-y-2 ${error ? 'border-destructive' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </Button>
        <Input
          value={group.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Group name (e.g. Color, Size, Ship By Label)"
          className="h-8 flex-1 font-medium"
        />
        {collapsed && (
          <span className="text-xs text-muted-foreground truncate max-w-[260px]">
            {group.options.length ? group.options.join(' · ') : 'No options yet'}
          </span>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove} title="Remove group">
          <Trash2 size={14} className="text-destructive" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive pl-9">{error}</p>}

      {!collapsed && (
        <div className="pl-9 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {group.options.map((o, idx) => (
              <Badge key={`${o}-${idx}`} variant="secondary" className="gap-1 font-normal">
                {o}
                <button type="button" onClick={() => removeOption(idx)} className="hover:text-destructive">
                  <X size={12} />
                </button>
              </Badge>
            ))}
            {group.options.length === 0 && <span className="text-xs text-muted-foreground">No options yet.</span>}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addOptions(draft);
                }
              }}
              onBlur={() => draft.trim() && addOptions(draft)}
              placeholder="Add option — press Enter or paste 'Red, Blue, Green'"
              className="h-8 flex-1 text-sm"
            />
            <Button variant="outline" size="sm" className="h-8" onClick={() => addOptions(draft)} disabled={!draft.trim()}>
              <Plus size={14} /> Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
