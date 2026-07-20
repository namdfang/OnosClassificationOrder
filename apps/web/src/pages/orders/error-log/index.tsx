import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { RoleType } from 'shared';

import { usePermission } from '@/hooks/usePermission';

import { ErrorLogTab } from '../ErrorLogTab';

export default function OrdersErrorLogPage() {
  const { roleName } = usePermission();
  // Support tạm ẩn tab "Nhật ký bù lỗi" — lỗi soát-tool không còn hiển thị ở đây.
  const visible = roleName !== RoleType.Support;

  if (!visible) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Bạn không có quyền xem trang này.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
          <AlertTriangle size={20} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nhật ký bù lỗi</h1>
          <p className="text-sm text-muted-foreground">Quản lý production orders</p>
        </div>
      </div>

      <ErrorLogTab />
    </div>
  );
}
