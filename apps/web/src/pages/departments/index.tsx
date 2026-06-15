import React from 'react';
import { Building2 } from 'lucide-react';

export default function Departments() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
          <Building2 size={20} className="text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Departments</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage organization departments</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-100 dark:border-slate-700/60 text-center">
        <p className="text-slate-500 dark:text-slate-400">Department management coming soon.</p>
      </div>
    </div>
  );
}
