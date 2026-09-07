'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { useSession } from '@/context/session-context';

/** Banner sticky khi admin đang xem thay khách; đặt `--viewas-h` để sidebar (fixed) né xuống. */
export function ImpersonationBanner() {
  const { profile, isImpersonating, signOut } = useSession();
  const { t } = useTranslation('seller');

  useEffect(() => {
    document.documentElement.style.setProperty('--viewas-h', isImpersonating ? '34px' : '0px');
    return () => document.documentElement.style.setProperty('--viewas-h', '0px');
  }, [isImpersonating]);

  if (!isImpersonating || !profile) return null;
  const name = profile.fullName || profile.userSku || profile.userEmail;
  return (
    <div className="sticky top-0 z-[60] h-[34px] flex items-center gap-2 px-3 bg-warning-bg text-warning text-[11px] font-semibold border-b border-warning/30">
      <Eye size={13} />
      <span className="flex-1 truncate">{t('impersonation.banner', { name })}</span>
      <button type="button" onClick={() => void signOut()} className="px-2 py-0.5 rounded-md bg-warning text-white text-[10px] font-bold">
        {t('impersonation.stop')}
      </button>
    </div>
  );
}
