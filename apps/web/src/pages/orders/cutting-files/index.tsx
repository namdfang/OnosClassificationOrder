import React from 'react';
import { Scissors } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { PATHS } from '@/constants/paths';
import { usePermission } from '@/hooks/usePermission';

import { ImportCuttingFilesTab } from '../ImportCuttingFilesTab';

export default function OrdersCuttingFilesPage() {
  const { has, canViewWorkshopTable } = usePermission();
  const navigate = useNavigate();
  const canImport = has('order.import');

  if (!canImport) {
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
          <Scissors size={20} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Import File Cutting</h1>
          <p className="text-sm text-muted-foreground">Quản lý production orders</p>
        </div>
      </div>

      <ImportCuttingFilesTab
        onApplied={() => {
          navigate(canViewWorkshopTable() ? PATHS.ORDERS_WORKSHOP : PATHS.ORDERS_ERROR_LOG);
        }}
      />
    </div>
  );
}
