'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, LogOut } from 'lucide-react';
import { OnosLogo } from '@/components/brand/logo';
import { CollapsibleNavItem } from '@/components/layout/collapsible-nav-item';
import { NotificationsBell } from '@/components/layout/notifications-bell';
import { useLanguage } from '@/components/providers/i18n-provider';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { useMobileSidebar } from '@/context/mobile-sidebar-context';
import { useSession } from '@/context/session-context';
import { buildCustomerNav, hrefDangChon } from '@/lib/navigation';

export function CustomerSidebar() {
  const { profile, signOut } = useSession();
  const { isOpen, close } = useMobileSidebar();
  const pathname = usePathname();
  const { t } = useTranslation('seller');
  const { language, toggleLanguage } = useLanguage();

  const navGroups = useMemo(() => buildCustomerNav(t), [t]);
  const hrefChon = hrefDangChon(
    pathname,
    navGroups.flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)])),
  );

  const name = profile?.fullName || profile?.userSku || profile?.userEmail || '';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <div
      className={`w-[210px] h-[calc(100vh-var(--viewas-h,0px))] flex flex-col fixed left-0 top-[var(--viewas-h,0px)] z-50 bg-sidebar border-r border-border1 transition-transform duration-300 lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="px-3 pt-3 pb-2 flex items-center gap-2 shrink-0 border-b border-border1">
        <OnosLogo title={t('brand.title')} subtitle={t('brand.subtitle')} className="flex-1 min-w-0" />
        <NotificationsBell />
      </div>

      <nav className="flex-1 px-1.5 py-1 overflow-y-auto scrollbar-thin">
        {navGroups.map((group) => (
          <div key={group.group} className="mb-0.5">
            <div className="px-2 pt-2 pb-1 text-[8.5px] font-bold text-text-muted uppercase tracking-wider">{group.group}</div>
            {group.items.map((item) => {
              if (item.children?.length) return <CollapsibleNavItem key={item.id} item={item} onNavigate={close} />;
              const isActive = item.href === hrefChon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={close}
                  prefetch={false}
                  className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] transition-all no-underline ${
                    isActive ? 'bg-accent text-white font-bold' : 'text-text-secondary font-medium hover:bg-card-hover'
                  }`}
                >
                  <span className="text-[12px] w-4 text-center">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-2.5 py-1.5 flex items-center gap-1 border-t border-border1">
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-text-secondary hover:bg-card-hover"
          title={t('common.language')}
        >
          <Languages size={12} />
          {language.toUpperCase()}
        </button>
        <div className="flex-1" />
        <ThemeToggle compact />
      </div>

      <div className="px-2.5 py-2 flex items-center gap-2 shrink-0 border-t border-border1">
        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-white text-[8px] font-bold">{initials || 'S'}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-text-primary truncate">{name}</div>
          <div className="text-[7.5px] text-text-muted">{t('nav.customer')}</div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="p-1 rounded hover:bg-card-hover transition-colors text-text-muted hover:text-text-secondary"
          title={t('nav.signOut')}
        >
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}
