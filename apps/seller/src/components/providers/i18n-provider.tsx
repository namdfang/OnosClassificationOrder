'use client';

import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { type AppLanguage, ensureI18n, writeLanguageCookie } from '@/i18n';

dayjs.extend(relativeTime);

interface LanguageCtx {
  language: AppLanguage;
  setLanguage: (l: AppLanguage) => void;
  toggleLanguage: () => void;
}
const Ctx = createContext<LanguageCtx | null>(null);

/**
 * Ngôn ngữ khởi tạo do server đọc cookie `onos_lang` (root layout) → client render cùng
 * ngôn ngữ ngay từ HTML đầu, không nháy. Đổi ngôn ngữ ghi cookie + đổi i18n + dayjs.
 */
export function I18nProvider({ initialLanguage, children }: { initialLanguage: AppLanguage; children: React.ReactNode }) {
  const [language, setLang] = useState<AppLanguage>(initialLanguage);
  const i18n = useMemo(() => ensureI18n(initialLanguage), [initialLanguage]);
  dayjs.locale(language);

  const setLanguage = useCallback(
    (l: AppLanguage) => {
      setLang(l);
      writeLanguageCookie(l);
      void i18n.changeLanguage(l);
      dayjs.locale(l);
      document.documentElement.lang = l;
    },
    [i18n],
  );
  const toggleLanguage = useCallback(() => setLanguage(language === 'vi' ? 'en' : 'vi'), [language, setLanguage]);

  const value = useMemo(() => ({ language, setLanguage, toggleLanguage }), [language, setLanguage, toggleLanguage]);
  return (
    <Ctx.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </Ctx.Provider>
  );
}

export function useLanguage(): LanguageCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLanguage must be used inside I18nProvider');
  return v;
}
