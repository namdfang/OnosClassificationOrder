import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';

import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../constants/paths';

function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[440px] text-center">
        <img src={logoUrl} alt="Logo" className="h-12 w-auto object-contain mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Printsel</h1>
        <p className="text-sm text-muted-foreground mt-1.5 mb-8">
          Hệ thống quản lý sản xuất &amp; đơn hàng in ấn theo yêu cầu
        </p>

        <div className="flex flex-col gap-3">
          <Button className="w-full h-10" onClick={() => navigate(PATHS.LOGIN)}>
            Đăng nhập hệ thống
          </Button>
          <Button variant="secondary" className="w-full h-10" onClick={() => navigate(PATHS.CUSTOMER_LOGIN)}>
            Khách hàng — Đặt đơn &amp; theo dõi tiến trình
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Landing;
