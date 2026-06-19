import React from 'react';
import { Pagination } from './Pagination';

/**
 * `PaginationBar` đóng gói `<Pagination>` với khung phù hợp để đặt ngay trên
 * hoặc dưới 1 table. Dùng cùng chỗ — không phải `<Pagination>` trần — đảm
 * bảo style giữa các table thống nhất + auto-hide khi không có dữ liệu.
 *
 * Pattern:
 *   <PaginationBar position="top" page=... pageSize=... total=... onChange=... />
 *   <div className="rounded-lg border border-border bg-card">
 *     <Table>...</Table>
 *     <PaginationBar position="bottom" ... />
 *   </div>
 *
 * - `position="top"` → standalone card có viền + nền (đặt trên cụm table).
 * - `position="bottom"` → 1 dải có `border-t` (đặt bên trong card của table).
 * - `total === 0 || loading === true` → render `null`.
 */
interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onChange: (page: number, pageSize: number) => void;
  /** Đặt ở đâu — quyết định kiểu wrapper. */
  position: 'top' | 'bottom';
  /** Khi đang loading lần đầu (chưa có total) ẩn bar tránh nhấp nháy. */
  loading?: boolean;
}

export function PaginationBar({
  position,
  loading = false,
  total,
  ...rest
}: PaginationBarProps) {
  if (loading || total <= 0) return null;

  const inner = <Pagination {...rest} total={total} />;

  if (position === 'top') {
    return <div className="rounded-lg border border-border bg-card p-3">{inner}</div>;
  }
  return <div className="border-t border-border p-3">{inner}</div>;
}
