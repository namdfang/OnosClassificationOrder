'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomerSidebar } from '@/components/layout/customer-sidebar';
import { ImpersonationBanner } from '@/components/layout/impersonation-banner';
import { MobileMenuButton } from '@/components/layout/mobile-menu-button';
import { SidebarBackdrop } from '@/components/layout/sidebar-backdrop';
import { useSession } from '@/context/session-context';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, isLoading } = useSession();
  const { t } = useTranslation('seller');

  // Cookie có nhưng BE bảo hết hạn → proxy đã xóa cookie; đưa về login.
  useEffect(() => {
    if (!isLoading && !profile) {
      window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
    }
  }, [isLoading, profile]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <p className="text-sm text-text-muted">{t('login.sessionExpired')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ImpersonationBanner />
      <div className="flex flex-1">
        <CustomerSidebar />
        <SidebarBackdrop />
        <MobileMenuButton />
        <div className="flex-1 ml-0 lg:ml-[210px] flex flex-col min-w-0">
          <main className="flex-1 p-3 sm:p-4 lg:p-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
