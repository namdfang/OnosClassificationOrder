import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, UserCog } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthStore } from '@/store/authStore';
import { useCustomerAuthStore } from '@/store/customerAuthStore';

import { Button } from '@/components/ui/button';

import { exitImpersonation, goToImpersonateHome } from '@/utils/impersonation';

/**
 * Dải cảnh báo "đang mạo danh ai" — hiện ở MỌI trang trong khu vực đã đăng nhập
 * (`/adm`, `/ffm`, `/customer`), tức đặt trong CẢ `MainLayout` lẫn
 * `CustomerLayout`. AUTH-1 `BR-7` / `AC-04`.
 *
 * **Đây không phải chi tiết trang trí.** Người mạo danh có TOÀN QUYỀN của người
 * bị mạo danh, phần lớn màn hình hệ thống này là thao tác theo lô, và ở 14 module
 * chưa có ghi vết thì thay đổi không truy được về ai (`SRS` §6.1a). Sau khi người
 * dùng chốt bỏ audit toàn cục, dải này là **biện pháp an toàn duy nhất còn lại**.
 * Vì vậy nó được dựng theo hướng KHÓ BỎ QUA, không phải theo hướng đẹp:
 *
 * - dính đỉnh trang, **không đóng được** (không có nút `×`);
 * - **đẩy** nội dung xuống thay vì phủ đè, để không thể cuộn trôi qua;
 * - dùng **màu cảnh báo** chứ không phải màu thương hiệu — nó phải trông KHÁC
 *   phần còn lại của hệ thống;
 * - nêu **tên + vai trò** người bị mạo danh, không chỉ nói "đang mạo danh";
 * - **lối thoát nằm ngay trong dải**, và ở màn hẹp thì rút gọn chữ chứ TUYỆT ĐỐI
 *   không ẩn nút thoát.
 *
 * Nguồn dữ liệu là `profile.impersonatedBy` của đúng store phụ trách khu vực
 * đang đứng — backend trả field này ở CẢ `/auth/me` lẫn `/customer/auth/me` với
 * cùng hình dạng, nên hai layout dùng chung một đường xử lý.
 */
interface Props {
  /** `staff` cho `/adm` + `/ffm` (đọc `authStore`), `customer` cho `/customer`. */
  source: 'staff' | 'customer';
}

export function ImpersonationBanner({ source }: Props) {
  const { t } = useTranslation('auth');
  const staffProfile = useAuthStore((s) => s.profile);
  const customerProfile = useCustomerAuthStore((s) => s.profile);
  const [exiting, setExiting] = useState(false);

  const profile = source === 'staff' ? staffProfile : customerProfile;
  const impersonatedBy = profile?.impersonatedBy;
  if (!impersonatedBy) return null;

  const name =
    source === 'staff'
      ? staffProfile?.fullName || staffProfile?.email || ''
      : customerProfile?.fullName || customerProfile?.userSku || customerProfile?.userEmail || '';
  const role = source === 'staff' ? staffProfile?.role?.name : t('impersonate.badgeCustomer');

  const handleExit = async () => {
    setExiting(true);
    const ok = await exitImpersonation();
    if (ok) {
      goToImpersonateHome();
      return;
    }
    setExiting(false);
    toast.error(t('impersonate.exitFailed'));
  };

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b-2 border-amber-500 bg-amber-100 px-3 py-2 text-amber-950 dark:bg-amber-900/60 dark:text-amber-50"
    >
      <UserCog size={16} className="shrink-0" />
      <p className="min-w-0 flex-1 truncate text-xs font-semibold sm:text-sm">
        {role ? t('impersonate.banner', { name, role }) : t('impersonate.bannerNoRole', { name })}
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={exiting}
        onClick={() => void handleExit()}
        className="h-7 shrink-0 border-amber-700 bg-amber-50 text-xs text-amber-950 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-50"
      >
        <LogOut size={13} className="sm:mr-1" />
        <span className="hidden sm:inline">{t('impersonate.exit')}</span>
      </Button>
    </div>
  );
}

export default ImpersonationBanner;
