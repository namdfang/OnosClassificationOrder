import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';
import App from './App';
import './theme/globals.css';
import './assets/styles/index.css';
import { Toaster } from './components/ui/sonner';
import { useThemeStore } from './store/themeStore';
import { registerImageCacheSW } from './utils/registerSW';

dayjs.extend(customParseFormat);
dayjs.extend(weekday);
dayjs.extend(localeData);

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
