import React from 'react';
import { RefreshCw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { SelectFilter } from '@/components/common/SelectFilter';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/utils/cn';

/** 1 cột select trong grid facet — option list + permission gate. */
export interface OrderFilterFacet {
  /** Unique key, dùng cho React `key` + debug. */
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; count?: number }>;
  /** Permission code để gate. Bỏ trống → luôn hiển thị. */
  perm?: string;
  /** Override để ẩn không qua perm (vd: role-specific). */
  hidden?: boolean;
}

export interface OrderFilterBarProps {
  /** Search input (Production ID / SKU / Order ID / Type). Bỏ qua nếu không truyền. */
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;

  /** Date range picker. Để bật, truyền cả `createdFrom`, `createdTo`, `onDateRangeChange`. */
  createdFrom?: string;
  createdTo?: string;
  onDateRangeChange?: (from: string, to: string) => void;

  onReload: () => void;
  loading?: boolean;

  /** Facet selects ở grid phía dưới. */
  facets?: OrderFilterFacet[];

  /** Slot phụ ở hàng top, nằm cạnh nút "Tải lại" — dùng cho view switcher,
   *  collapse-all button, "Lỗi cần xử lý" chip… */
  topActionsRight?: React.ReactNode;
  /** Slot phụ chèn giữa top row và facet grid — dùng cho active chip bar,
   *  factory chip bar… */
  middleRow?: React.ReactNode;

  className?: string;
}

const DEFAULT_SEARCH_PLACEHOLDER = 'Tìm Production ID / SKU / Order ID / Type...';

/**
 * Filter bar chuẩn cho mọi bảng order. Reusable across:
 *  - `OrderTableWorkshop` (reference)
 *  - `ErrorLogTab`
 *  - `OrderFactoryTab`
 *  - `OrderStatusTab`
 *
 * Layout cố định:
 *   - Top row: search input (flex-1) + DateRangePicker + Tải lại + extras.
 *   - Middle row (optional): slot tự do — chip bar / view-mode chips.
 *   - Facet grid: 2 / 3 / 5 cột responsive, mỗi cell là `<SelectFilter>` đã
 *     gate qua `usePermission().has(perm)`.
 *
 * Component không own state — caller cung cấp value + setter. URL sync để
 * caller tự handle (mỗi tab có prefix param riêng).
 */
export function OrderFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = DEFAULT_SEARCH_PLACEHOLDER,
  createdFrom,
  createdTo,
  onDateRangeChange,
  onReload,
  loading = false,
  facets,
  topActionsRight,
  middleRow,
  className,
}: OrderFilterBarProps) {
  const { has } = usePermission();

  const showSearch = search !== undefined && onSearchChange !== undefined;
  const showDateRange =
    createdFrom !== undefined && createdTo !== undefined && !!onDateRangeChange;

  const visibleFacets = (facets || []).filter(
    (f) => !f.hidden && (!f.perm || has(f.perm)),
  );

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3 space-y-3',
        className,
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {showSearch && (
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={13}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-7 h-9 text-sm"
            />
          </div>
        )}
        {showDateRange && (
          <DateRangePicker
            from={createdFrom}
            to={createdTo}
            onChange={onDateRangeChange}
          />
        )}
        <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Tải lại
        </Button>
        {topActionsRight}
      </div>

      {middleRow}

      {visibleFacets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {visibleFacets.map((f) => (
            <SelectFilter
              key={f.key}
              label={f.label}
              value={f.value}
              onChange={f.onChange}
              options={f.options}
            />
          ))}
        </div>
      )}
    </div>
  );
}
