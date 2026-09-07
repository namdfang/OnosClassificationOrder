'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HubSidebar } from '@/components/hub/hub-sidebar';
import { MobileMenuButton } from '@/components/layout/mobile-menu-button';
import { SidebarBackdrop } from '@/components/layout/sidebar-backdrop';
import { HubSessionProvider, useHubSession } from '@/context/hub-session-context';

const HUB_ROLES = new Set(['SuperAdmin', 'Admin']);

/** Gate khu quản trị: phải có phiên nhân viên (cookie hub) + vai Admin/SuperAdmin — SellerPortal.md §9. */
function HubShell({ children }: { children: React.ReactNode }) {
  const { user, roleName, isLoading } = useHubSession();
  const { t } = useTranslation('hub');
  useEffect(() => {
    if (!isLoading && !user) window.location.href = `/hub/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
  }, [isLoading, user]);
  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!HUB_ROLES.has(roleName)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <p className="text-sm text-text-muted">{t('login.forbidden')}</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex bg-background">
      <HubSidebar />
      <SidebarBackdrop />
      <MobileMenuButton />
      <div className="flex-1 ml-0 lg:ml-[210px] flex flex-col min-w-0">
        <main className="flex-1 p-3 sm:p-4 lg:p-5">{children}</main>
      </div>
    </div>
  );
}

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <HubSessionProvider>
      <HubShell>{children}</HubShell>
    </HubSessionProvider>
  );
}
