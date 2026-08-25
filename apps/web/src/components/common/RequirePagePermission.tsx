import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';

import { PATHS } from '@/constants/paths';

import { buildPagePermissionMap } from '@/components/sidebar/Sidebar';
import { Button } from '@/components/ui/button';

import { usePermission } from '@/hooks/usePermission';

/**
 * AUTH-7 — lớp chặn CUỐI ở điều hướng cho mọi trang `/adm` + `/ffm`.
 *
 * Ẩn mục trên sidebar KHÔNG phải là chặn: URL thì ai gõ cũng được, và người dùng
 * hay lưu bookmark hoặc được gửi link. Trước task này, vai không có quyền trang
 * gõ thẳng URL vẫn dựng được trang, rồi mọi API trả 403 nên họ nhận một cái bảng
 * TRỐNG không nói vì sao — đúng màn hình khó hiểu đã sinh ra AUTH-6.
 *
 * Đây là lớp THỨ HAI, không thay thế `@Auth` ở API: API vẫn phải tự từ chối. Lớp
 * này chỉ để triệu chứng không lọt tới người dùng khi hai nguồn quyền lệch nhau.
 *
 * Mã quyền của trang tra từ CHÍNH cây menu (`buildPagePermissionMap`) — trang
 * không khai mã quyền thì CHO VÀO, giữ nguyên hành vi cũ.
 */
export function RequirePagePermission({ path, children }: { path: string; children: React.ReactNode }) {
  const { t } = useTranslation('layout');
  const { has } = usePermission();
  const navigate = useNavigate();

  const requiredPerm = useMemo(() => buildPagePermissionMap(t).get(path), [t, path]);

  if (requiredPerm && !has(requiredPerm)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
          <ShieldOff size={26} className="text-destructive" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">{t('noAccess.title')}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t('noAccess.description')}</p>
        <div className="mt-2 flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            {t('noAccess.back')}
          </Button>
          <Button onClick={() => navigate(PATHS.HOME)}>{t('noAccess.home')}</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
