import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

import { usePermission } from '@/hooks/usePermission';
import DesignerAssignmentConfig from '@/components/settings/DesignerAssignmentConfig';

export default function Settings() {
  const { has } = usePermission();
  const canManage = has('role.manage');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
          <SettingsIcon size={20} className="text-slate-600 dark:text-slate-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">System configuration</p>
        </div>
      </div>

      {canManage ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700/60">
          <DesignerAssignmentConfig />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-100 dark:border-slate-700/60 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            Bạn không có quyền truy cập cấu hình hệ thống.
          </p>
        </div>
      )}
    </div>
  );
}
