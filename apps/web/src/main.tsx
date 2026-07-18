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
import { useThemeStore } from './store/themeStore';
import { registerImageCacheSW } from './utils/registerSW';

import './theme/globals.css';
import './assets/styles/index.css';

dayjs.extend(customParseFormat);
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(relativeTime);
dayjs.locale('vi');

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

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
