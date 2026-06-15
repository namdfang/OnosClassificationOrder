import React from 'react';
import { User } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function Account() {
  const { profile } = useAuthStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
          <User size={20} className="text-rose-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Account</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Your profile and preferences</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700/60">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Full name</p>
            <p className="text-base text-slate-800 dark:text-slate-100 mt-1">{profile?.fullName || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Email</p>
            <p className="text-base text-slate-800 dark:text-slate-100 mt-1">{profile?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Role</p>
            <p className="text-base text-slate-800 dark:text-slate-100 mt-1">{profile?.role?.name || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
