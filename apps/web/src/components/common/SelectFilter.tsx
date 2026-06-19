import React from 'react';
import type { FactoryFilterOption } from 'shared';

import { cn } from '@/utils/cn';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: FactoryFilterOption[];
}

/**
 * Native HTML <select> với tổng count ở option "— Tất cả —" và count theo
 * từng option. Dùng chung cho OrderFactoryTab + OrderTableWorkshop. Options
 * nên là kết quả faceted aggregation từ BE (đã exclude facet hiện tại) để
 * count phản ánh đúng các filter khác đang active.
 */
export function SelectFilter({ label, value, onChange, options }: Props) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          value ? 'border-primary' : 'border-input',
        )}
      >
        <option value="">— Tất cả ({options.reduce((s, o) => s + o.count, 0)}) —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
    </div>
  );
}
