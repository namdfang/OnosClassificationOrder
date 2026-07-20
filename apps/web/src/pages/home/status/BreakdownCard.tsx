import React, { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { cn } from '@/utils/cn';

import { LucideIcon } from '@/pages/workshop-config/IconPicker';

export type BreakdownRow = {
  code: string | null;
  name: string;
  count: number;
  color?: string;
  icon?: string;
};

interface Props {
  title: string;
  items: BreakdownRow[];
  selectedCodes: string[];
  onToggle: (code: string) => void;
  /** Visual mode of the badges in this card. Auto-determined by which fields have color. */
  mode: 'color' | 'icon';
  initialVisible?: number;
}

export function BreakdownCard({ title, items, selectedCodes, onToggle, mode, initialVisible = 8 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = useMemo(() => items.reduce((s, it) => s + it.count, 0), [items]);
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.count)), [items]);

  const visible = expanded ? items : items.slice(0, initialVisible);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold truncate">{title}</h3>
        <Badge variant="outline" className="text-[10px]">
          {totalCount}
        </Badge>
      </div>
      <div className="divide-y divide-border">
        {visible.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground text-center">Không có data</p>}
        {visible.map((it) => {
          const isSelected = !!it.code && selectedCodes.includes(it.code);
          const pct = (it.count / max) * 100;
          return (
            <button
              key={String(it.code)}
              type="button"
              onClick={() => it.code && onToggle(it.code)}
              disabled={!it.code}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors relative',
                isSelected ? 'bg-primary/10' : 'hover:bg-accent/40',
                !it.code && 'cursor-default text-muted-foreground italic',
              )}
            >
              <span className="absolute inset-y-0 left-0 bg-primary/5" style={{ width: pct + '%' }} />
              <span className="relative w-4 shrink-0">
                {isSelected && <Check size={12} className="text-primary" />}
              </span>
              <span className="relative flex-1 truncate inline-flex items-center gap-1.5">
                {mode === 'color' && it.color && (
                  <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: it.color }} />
                )}
                {mode === 'icon' && it.icon && <LucideIcon name={it.icon} size={12} />}
                {it.name}
              </span>
              <span className="relative font-mono text-[11px] tabular-nums shrink-0">{it.count}</span>
            </button>
          );
        })}
      </div>
      {items.length > initialVisible && (
        <div className="border-t border-border px-2 py-1">
          <Button variant="ghost" size="sm" className="w-full h-7 text-[11px]" onClick={() => setExpanded((v) => !v)}>
            <ChevronDown size={12} className={cn('transition-transform', expanded && 'rotate-180')} />
            {expanded ? 'Thu gọn' : `Xem thêm ${items.length - initialVisible}`}
          </Button>
        </div>
      )}
    </div>
  );
}
