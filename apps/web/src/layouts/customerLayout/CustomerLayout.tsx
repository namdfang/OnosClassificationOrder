import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { Languages, LayoutGrid, LogOut, PackagePlus, UserCircle2 } from 'lucide-react';

import { NotificationBell } from '@/components/customer/NotificationBell';
import { Button } from '@/components/ui/button';

import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../constants/paths';
import { RepositoryRemote } from '../../services';
import { useCustomerAuthStore } from '../../store/customerAuthStore';
import { useLanguageStore } from '../../store/languageStore';

function CustomerLayout() {
  const navigate = useNavigate();
  const { t } = useTranslation('customerPortal');
  const { profile, setProfile, clearToken } = useCustomerAuthStore();
  const { language, toggleLanguage } = useLanguageStore();

  useEffect(() => {
    RepositoryRemote.customerAuth
      .getMe()
      .then((res) => {
        if (res?.data?.data) setProfile(res.data.data);
      })
      .catch(() => {
        /* interceptor tự xử lý 401 */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to={PATHS.CUSTOMER_ORDERS} className="flex items-center gap-2">
            <img src={logoUrl} alt="Logo" className="h-7 w-auto object-contain" />
            <span className="font-semibold text-sm">{t('layout.brand')}</span>
          </Link>

          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={() => navigate(PATHS.CUSTOMER_CATALOG)}>
              <LayoutGrid size={14} className="mr-1.5" />
              {t('layout.catalog')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate(PATHS.CUSTOMER_ORDER_NEW)}>
              <PackagePlus size={14} className="mr-1.5" />
              {t('layout.newOrder')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate(PATHS.CUSTOMER_ACCOUNT)}>
              <UserCircle2 size={14} className="mr-1.5" />
              {t('layout.account')}
            </Button>
            {profile?.userEmail && (
              <span className="text-xs text-muted-foreground hidden sm:inline">{profile.userEmail}</span>
            )}
            <NotificationBell />
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleLanguage}
              title={t('language.switch', { ns: 'common' })}
              className="gap-1 w-auto px-2"
            >
              <Languages size={16} />
              <span className="text-xs font-medium uppercase">{language}</span>
            </Button>
            <button
              type="button"
              onClick={clearToken}
              aria-label={t('layout.logout')}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default CustomerLayout;
