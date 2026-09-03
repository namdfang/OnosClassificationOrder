import React from 'react';
import { useTranslation } from 'react-i18next';
import { ZaloConfigProvider, ZaloSettings } from '@zero-126/zalo-ui';

import { PATHS } from '@/constants/paths';

import { Spinner } from '@/components/common/Spinner';

import { useZaloSession } from './useZaloSession';

import '@zero-126/zalo-ui/theme.css';

/**
 * Trang cài đặt của module Zalo (`/adm/zalo/settings`): thêm/xoá nick, quét QR,
 * trả lời tự động, phân quyền hội thoại. `ZaloSettings` đọc `basePath` từ
 * context nên phải bọc `ZaloConfigProvider` — `ZaloWorkspace` tự bọc, trang này
 * thì không.
 */
export default function ZaloChatSettingsPage() {
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
    <ZaloConfigProvider value={{ basePath: PATHS.ZALO_CHAT, settingsPath: PATHS.ZALO_CHAT_SETTINGS }}>
      <ZaloSettings className="h-[calc(100vh-8rem)]" fillHeight />
    </ZaloConfigProvider>
  );
}
