import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldHalf } from 'lucide-react';

export default function CustomRoles() {
  const { t } = useTranslation('auth');
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
          <ShieldHalf size={20} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('customRoles.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('customRoles.subtitle')}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-100 dark:border-slate-700/60 text-center">
        <p className="text-slate-500 dark:text-slate-400">{t('customRoles.comingSoon')}</p>
      </div>
    </div>
  );
}
