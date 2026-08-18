import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Languages, LayoutDashboard, LayoutGrid, LogOut, Package, PackagePlus, UserCircle2 } from 'lucide-react';

import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner';
import { NotificationBell } from '@/components/customer/NotificationBell';
import { Button } from '@/components/ui/button';

import { cn } from '@/utils/cn';

import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../constants/paths';
import { RepositoryRemote } from '../../services';
import { useCustomerAuthStore } from '../../store/customerAuthStore';
import { useLanguageStore } from '../../store/languageStore';

interface CustomerNavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  /** NavLink `end` — Dashboard match exact, Orders/Catalog match cả route con. */
  end?: boolean;
}

function buildNavItems(t: (key: string) => string): CustomerNavItem[] {
  return [
    {
      path: PATHS.CUSTOMER_DASHBOARD,
      label: t('layout.nav.dashboard'),
      icon: <LayoutDashboard size={18} />,
      end: true,
    },
    { path: PATHS.CUSTOMER_ORDERS, label: t('layout.nav.orders'), icon: <Package size={18} /> },
    { path: PATHS.CUSTOMER_CATALOG, label: t('layout.nav.catalog'), icon: <LayoutGrid size={18} /> },
  ];
}

function CustomerLayout() {
  const navigate = useNavigate();
  const { t } = useTranslation('customerPortal');
  const { profile, setProfile, clearToken } = useCustomerAuthStore();
  const { language, toggleLanguage } = useLanguageStore();
  const navItems = useMemo(() => buildNavItems(t), [t]);

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

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
      isActive
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Dải cảnh báo mạo danh — trên CÙNG, trước cả header (AUTH-1 BR-7/AC-04). */}
      <ImpersonationBanner source="customer" />
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to={PATHS.CUSTOMER_DASHBOARD} className="flex items-center gap-2">
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

      {/* Mobile: sidebar thu thành thanh nav ngang dưới header */}
      <nav className="md:hidden border-b border-border">
        <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="flex-1 max-w-7xl w-full mx-auto flex items-stretch">
        {/* Desktop: sidebar điều hướng BÊN TRÁI */}
        <aside className="hidden md:block w-56 shrink-0 border-r border-border px-3 py-6">
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('layout.nav.title')}
          </p>
          <div className="space-y-1">
            {navItems.map((item) => (
              <NavLink key={item.path} to={item.path} end={item.end} className={navLinkClass}>
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-border">
            <Button size="sm" className="w-full" onClick={() => navigate(PATHS.CUSTOMER_ORDER_NEW)}>
              <PackagePlus size={14} className="mr-1.5" />
              {t('layout.newOrder')}
            </Button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default CustomerLayout;
