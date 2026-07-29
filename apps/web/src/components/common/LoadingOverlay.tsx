import React from 'react';

import { cn } from '@/utils/cn';

import { Spinner } from './Spinner';

/**
 * Bọc quanh 1 block dữ liệu (table/list/card) — khi `active`, phủ 1 lớp mờ +
 * spinner LÊN TRÊN nội dung cũ thay vì ẩn/xoá nó, tránh nhấp nháy/giật layout
 * mỗi lần refetch (đổi trang, đổi filter, reload...). Dùng cho các block ĐÃ
 * có data hiển thị — trạng thái load lần đầu (chưa có gì) vẫn nên tự xử lý
 * riêng (empty-state spinner) ở nơi gọi.
 */
interface LoadingOverlayProps {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}

export function LoadingOverlay({ active, children, className }: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {active && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-background/60 backdrop-blur-[1px]">
          <Spinner size={22} className="text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
