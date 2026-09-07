'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Bell, ExternalLink, Languages, LayoutDashboard, LogOut, Package, Users } from 'lucide-react';
import { OnosLogo } from '@/components/brand/logo';
import { useLanguage } from '@/components/providers/i18n-provider';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { useHubSession } from '@/context/hub-session-context';
import { useMobileSidebar } from '@/context/mobile-sidebar-context';
import { hrefDangChon } from '@/lib/navigation';

export function HubSidebar() {
  const { t } = useTranslation('hub');
  const { user, roleName, signOut } = useHubSession();
  const { isOpen, close } = useMobileSidebar();
  const { language, toggleLanguage } = useLanguage();
  const pathname = usePathname();
  const items = [
    { href: '/hub', label: t('nav.dashboard'), icon: LayoutDashboard },
    { href: '/hub/sellers', label: t('nav.sellers'), icon: Users },
    { href: '/hub/orders', label: t('nav.orders'), icon: Package },
    { href: '/hub/notifications', label: t('nav.notifications'), icon: Bell },
  ];
  const active = hrefDangChon(pathname.replace(/^\/hub$/, '/portal').replace(/^\/hub\//, '/portal/'), items.map((i) => i.href.replace(/^\/hub$/, '/portal').replace(/^\/hub\//, '/portal/')));
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL;
  const initials = (user?.fullName || user?.email || 'A').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');

  return (
    <div className={`w-[210px] h-screen flex flex-col fixed left-0 top-0 z-50 bg-sidebar border-r border-border1 transition-transform duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="px-3 pt-3 pb-2 flex items-center gap-2 shrink-0 border-b border-border1">
        <OnosLogo title={t('brand.title')} subtitle={t('brand.subtitle')} className="flex-1 min-w-0" />
      </div>
      <nav className="flex-1 px-1.5 py-2 overflow-y-auto scrollbar-thin">
        <div className="px-2 pt-1 pb-1 text-[8.5px] font-bold text-text-muted uppercase tracking-wider">{t('nav.group')}</div>
        {items.map((item) => {
          const isActive = item.href.replace(/^\/hub$/, '/portal').replace(/^\/hub\//, '/portal/') === active;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={close} prefetch={false} className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-full text-[11px] transition-all no-underline ${isActive ? 'bg-accent text-white font-bold' : 'text-text-secondary font-medium hover:bg-card-hover'}`}>
              <Icon size={13} />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
        {adminUrl && (
          <>
            <div className="px-2 pt-3 pb-1 text-[8.5px] font-bold text-text-muted uppercase tracking-wider">{t('nav.groupOps')}</div>
            <a href={`${adminUrl}/ffm/orders/workshop`} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-full text-[11px] text-text-secondary font-medium hover:bg-card-hover no-underline">
              <ExternalLink size={13} />
              <span className="flex-1">{t('nav.factoryApp')}</span>
            </a>
          </>
        )}
      </nav>
      <div className="px-2.5 py-1.5 flex items-center gap-1 border-t border-border1">
        <button type="button" onClick={toggleLanguage} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-text-secondary hover:bg-card-hover"><Languages size={12} />{language.toUpperCase()}</button>
        <div className="flex-1" />
        <ThemeToggle compact />
      </div>
      <div className="px-2.5 py-2 flex items-center gap-2 shrink-0 border-t border-border1">
        <div className="w-6 h-6 rounded-full bg-cta flex items-center justify-center text-cta-foreground text-[8px] font-bold">{initials}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-text-primary truncate">{user?.fullName || user?.email}</div>
          <div className="text-[7.5px] text-text-muted">{roleName}</div>
        </div>
        <button type="button" onClick={() => void signOut()} className="p-1 rounded hover:bg-card-hover text-text-muted hover:text-text-secondary" title={t('nav.signOut')}><LogOut size={14} /></button>
      </div>
    </div>
  );
}
