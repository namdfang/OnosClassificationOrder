import React from 'react';
import { useTranslation } from 'react-i18next';
import { TelegramWorkspace } from '@zero-126/zalo-ui';

import { Spinner } from '@/components/common/Spinner';

import { useZaloSession } from '../zalo/useZaloSession';

import '@zero-126/zalo-ui/theme.css';

/**
 * Màn Telegram nhúng trong hệ thống (`/adm/telegram`), có từ engine
 * `20260909-dd6c38a` / gói `1.44.1`.
 *
 * Cùng engine, cùng phiên với màn Zalo: `useZaloSession` xin đúng một cookie và
 * server phát nó cho CẢ hai đường proxy (`ZALO_COOKIE_PATHS`), nên vào thẳng
 * trang này cũng có phiên chứ không phải ghé qua màn Zalo trước.
 *
 * Giao diện là của nhà cung cấp; trang này chỉ lo phiên và nói cho gói biết nó
 * đang gọi qua proxy nào của app.
 */
export default function TelegramPage() {
  const { t } = useTranslation('zaloChat');
  const { sanSang, loi } = useZaloSession();

  if (loi) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        {t('sessionFailed')}
      </div>
    );
  }

  if (!sanSang) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return <TelegramWorkspace className="h-[calc(100vh-8rem)] w-full" />;
}
