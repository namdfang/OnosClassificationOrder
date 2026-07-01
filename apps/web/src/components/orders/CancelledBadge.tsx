import React from 'react';

import { Badge } from '@/components/ui/badge';

/**
 * Badge "Đã hủy" (đỏ) + hiển thị luôn LÝ DO hủy (note) cạnh badge (truncate,
 * full trong tooltip). Dùng chung cho mọi bảng order.
 */
export function CancelledBadge({ reason, className }: { reason?: string | null; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 shrink-0 min-w-0 ${className ?? ''}`}>
      <Badge variant="destructive" className="text-[10px] px-1 py-0 shrink-0" title={reason || 'Đơn đã hủy'}>
        Đã hủy
      </Badge>
      {reason && (
        <span
          className="text-[10px] text-rose-600 dark:text-rose-400 truncate max-w-[180px]"
          title={reason}
        >
          {reason}
        </span>
      )}
    </span>
  );
}
