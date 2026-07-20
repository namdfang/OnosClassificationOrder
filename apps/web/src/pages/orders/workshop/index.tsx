import React from 'react';
import { ShoppingCart } from 'lucide-react';

import { usePermission } from '@/hooks/usePermission';

import { OrderTableWorkshop } from '../OrderTableWorkshop';

export default function OrdersWorkshopPage() {
  const { canViewWorkshopTable } = usePermission();

  if (!canViewWorkshopTable()) {
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
          <ShoppingCart size={20} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Danh sách đơn</h1>
          <p className="text-sm text-muted-foreground">Quản lý production orders</p>
        </div>
      </div>

      <OrderTableWorkshop />
    </div>
  );
}
