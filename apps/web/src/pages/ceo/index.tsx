import React from 'react';
import { useTranslation } from 'react-i18next';

import { usePageHeader } from '@/hooks/usePageHeader';
import { usePermission } from '@/hooks/usePermission';

import { OverviewBoard } from './OverviewBoard';

/**
 * CEO Dashboard (`/adm/ceo`) — bảng điều hành cho lãnh đạo, CHỈ SuperAdmin/Admin
 * (CeoDashboard.md). Mọi số trên trang lấy từ tổng hợp máy chủ dùng chung với trang
 * "Đơn hàng theo xưởng", nên đây cũng là "sự thật chung" để Agent báo cáo đối chiếu.
 * Bảng đầu tiên: Tổng quan (`OverviewBoard`); các bảng sau thêm vào cùng thư mục.
 */
export default function CeoDashboardPage() {
  const { t } = useTranslation('ceoDashboard');
  const { roleName } = usePermission();
  usePageHeader(t('title'), t('subtitle'));

  if (roleName !== 'SuperAdmin' && roleName !== 'Admin') {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">{t('noPermission')}</div>;
  }
  return <OverviewBoard />;
}
