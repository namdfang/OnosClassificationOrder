import 'dayjs/locale/vi';

import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import localeData from 'dayjs/plugin/localeData';
import relativeTime from 'dayjs/plugin/relativeTime';
import weekday from 'dayjs/plugin/weekday';

import App from './App';
import { Toaster } from './components/ui/sonner';
import { getStoredLanguage } from './i18n';
import { useAuthStore } from './store/authStore';
import { useCustomerAuthStore } from './store/customerAuthStore';
import {
  AUTH_REMEMBER_KEY,
  AUTH_STORE_KEY,
  CUSTOMER_REMEMBER_KEY,
  CUSTOMER_STORE_KEY,
  requestSessionHandoff,
  serveSessionHandoff,
} from './store/sessionPersist';
import { useThemeStore } from './store/themeStore';
import { registerImageCacheSW } from './utils/registerSW';

import './theme/globals.css';
import './assets/styles/index.css';

dayjs.extend(customParseFormat);
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(relativeTime);

const initialLanguage = getStoredLanguage();
dayjs.locale(initialLanguage);
document.documentElement.lang = initialLanguage;

registerImageCacheSW();

function Root() {
  const mode = useThemeStore((s) => s.mode);

  React.useEffect(() => {
    const root = document.documentElement;
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [mode]);

  return (
    <>
      <App />
      <Toaster richColors position="top-right" />
    </>
  );
}

/**
 * Khởi động app:
 *  1. Sẵn sàng chuyền phiên cho tab mới (`serve`).
 *  2. Nếu chính tab này là tab mới của một phiên "không ghi nhớ" thì đi xin phiên
 *     từ các tab anh em (`request`) — không có tab nào trả lời thì thôi.
 *  3. Hydrate 2 auth store (đang bật `skipHydration`) RỒI mới render, để lần
 *     render đầu tiên đã biết chính xác user còn đăng nhập hay không.
 */
async function bootstrap() {
  try {
    serveSessionHandoff(AUTH_STORE_KEY);
    serveSessionHandoff(CUSTOMER_STORE_KEY);

    await Promise.all([
      requestSessionHandoff(AUTH_STORE_KEY, AUTH_REMEMBER_KEY),
      requestSessionHandoff(CUSTOMER_STORE_KEY, CUSTOMER_REMEMBER_KEY),
    ]);
  } finally {
    // Dù handoff lỗi (storage bị chặn...) vẫn phải hydrate + render app.
    await Promise.all([useAuthStore.persist.rehydrate(), useCustomerAuthStore.persist.rehydrate()]);

    ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
  }
}

void bootstrap();
