import React from 'react';
import { useTranslation } from 'react-i18next';
import { ZaloWorkspace } from '@zero-126/zalo-ui';

import { PATHS } from '@/constants/paths';

import { Spinner } from '@/components/common/Spinner';

import { useZaloSession } from './useZaloSession';

import '@zero-126/zalo-ui/theme.css';

/**
 * Màn chat Zalo nhúng trong hệ thống (`/adm/zalo`).
 *
 * Toàn bộ giao diện là của gói `@zero-126/zalo-ui`; trang này chỉ lo hai việc:
 * xin cookie phiên trước (`useZaloSession`) và nói cho gói biết nó đang được
 * mount ở đường nào để dựng deep link đúng.
 */
export default function ZaloChatPage() {
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

  return (
    <ZaloWorkspace
      basePath={PATHS.ZALO_CHAT}
      settingsPath={PATHS.ZALO_CHAT_SETTINGS}
      className="h-[calc(100vh-8rem)] w-full"
    />
  );
}
