import React, { useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { LayoutGrid, LogOut, PackagePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';

import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../constants/paths';
import { RepositoryRemote } from '../../services';
import { useCustomerAuthStore } from '../../store/customerAuthStore';

function CustomerLayout() {
  const navigate = useNavigate();
  const { profile, setProfile, clearToken } = useCustomerAuthStore();

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
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to={PATHS.CUSTOMER_ORDERS} className="flex items-center gap-2">
            <img src={logoUrl} alt="Logo" className="h-7 w-auto object-contain" />
            <span className="font-semibold text-sm">Customer Portal</span>
          </Link>

          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={() => navigate(PATHS.CUSTOMER_CATALOG)}>
              <LayoutGrid size={14} className="mr-1.5" />
              Danh mục sản phẩm
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate(PATHS.CUSTOMER_ORDER_NEW)}>
              <PackagePlus size={14} className="mr-1.5" />
              Đặt đơn mới
            </Button>
            {profile?.userEmail && (
              <span className="text-xs text-muted-foreground hidden sm:inline">{profile.userEmail}</span>
            )}
            <button
              type="button"
              onClick={clearToken}
              aria-label="Đăng xuất"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default CustomerLayout;
