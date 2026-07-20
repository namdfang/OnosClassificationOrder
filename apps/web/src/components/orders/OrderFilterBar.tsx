import React from 'react';
import { ListChecks, RefreshCw, Search } from 'lucide-react';

import { DateRangePicker } from '@/components/common/DateRangePicker';
import { Hint } from '@/components/common/Hint';
import { SelectFilter } from '@/components/common/SelectFilter';
import { BulkProductionIdDialog, parseProductionIds } from '@/components/orders/BulkProductionIdDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { cn } from '@/utils/cn';

import { usePermission } from '@/hooks/usePermission';

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

  /**
   * Bật nút "Tìm nhiều mã" cạnh ô search → mở modal dán danh sách Production ID
   * (mỗi mã 1 dòng / phẩy / khoảng trắng). Trả mảng mã đã parse cho caller lọc
   * bảng (thường set param `productionIds`). Bỏ trống → không hiện nút.
   */
  onBulkApply?: (ids: string[]) => void;
  /** Danh sách mã đang áp — seed lại modal khi mở để user thấy mã đã dán. */
  bulkIds?: string[];

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

const DEFAULT_SEARCH_PLACEHOLDER =
  'Tìm Production ID / SKU / Order ID / Type… (dán nhiều mã cách nhau bằng phẩy/khoảng trắng)';

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
  onBulkApply,
  bulkIds,
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
  const [bulkOpen, setBulkOpen] = React.useState(false);

  // Đếm số mã parse được từ ô search (hiện badge "N mã" khi tìm nhiều mã).
  const searchTokenCount = search ? parseProductionIds(search).length : 0;

  const showSearch = search !== undefined && onSearchChange !== undefined;
  const showDateRange = createdFrom !== undefined && createdTo !== undefined && !!onDateRangeChange;

  const visibleFacets = (facets || []).filter((f) => !f.hidden && (!f.perm || has(f.perm)));

  return (
    <div className={cn('rounded-lg border border-border bg-card p-3 space-y-3', className)}>
      <div className="flex items-center gap-2 flex-wrap">
        {showSearch && (
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onPaste={(e) => {
                // Dán 1 cột mã (mỗi mã 1 dòng) từ Google Sheets → gộp xuống dòng
                // thành khoảng trắng để ô 1 dòng vẫn giữ đủ mã cho BE tách token.
                const text = e.clipboardData.getData('text');
                if (!/[\r\n\t]/.test(text)) return;
                e.preventDefault();
                const input = e.currentTarget;
                const start = input.selectionStart ?? search.length;
                const end = input.selectionEnd ?? search.length;
                const normalized = text.replace(/[\r\n\t]+/g, ' ').trim();
                onSearchChange(search.slice(0, start) + normalized + search.slice(end));
              }}
              className={cn('pl-7 h-9 text-sm', searchTokenCount > 1 && 'pr-12')}
            />
            {searchTokenCount > 1 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-primary pointer-events-none">
                {searchTokenCount} mã
              </span>
            )}
          </div>
        )}
        {showSearch && onBulkApply && (
          <Hint content="Dán danh sách mã (mỗi Production ID một dòng) để lọc bảng">
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
              <ListChecks size={14} />
              Nhiều mã
            </Button>
          </Hint>
        )}
        <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Tải lại
        </Button>
        {topActionsRight}
      </div>

      {showDateRange && (
        <DateRangePicker variant="inline" from={createdFrom} to={createdTo} onChange={onDateRangeChange} />
      )}

      {middleRow}

      {visibleFacets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {visibleFacets.map((f) => (
            <SelectFilter key={f.key} label={f.label} value={f.value} onChange={f.onChange} options={f.options} />
          ))}
        </div>
      )}

      {onBulkApply && (
        <BulkProductionIdDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          mode="filter"
          onApply={onBulkApply}
          initialIds={bulkIds}
        />
      )}
    </div>
  );
}
