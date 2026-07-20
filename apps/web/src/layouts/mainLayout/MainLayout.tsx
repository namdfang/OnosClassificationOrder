import React, { useEffect, useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import { useAuthStore } from '@/store/authStore';

import { RepositoryRemote } from '@/services';

import { useIsMobile } from '@/hooks/useMediaQuery';

import Header from '../../components/header';
import Sidebar from '../../components/sidebar/Sidebar';

function MainLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const isMobile = useIsMobile();
  const setProfile = useAuthStore((s) => s.setProfile);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Refresh profile on mount so persisted localStorage (from previous sessions
  // with an older payload shape) gets replaced with the latest one — including
  // role.permissionCodes which sidebar needs to filter menu items.
  useEffect(() => {
    let cancelled = false;
    RepositoryRemote.auth
      .getMe()
      .then((res) => {
        if (!cancelled && res?.data?.data) setProfile(res.data.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [setProfile]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ height: '100vh' }}>
        <Header
          changeCollapsed={() => (isMobile ? setMobileOpen(true) : setCollapsed(!collapsed))}
          collapsed={collapsed}
          isMobile={isMobile}
        />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
