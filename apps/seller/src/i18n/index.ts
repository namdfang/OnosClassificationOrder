import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from './locales/en/common.json';
import customerNotificationsEn from './locales/en/customerNotifications.json';
import customerPortalEn from './locales/en/customerPortal.json';
import hubEn from './locales/en/hub.json';
import sellerEn from './locales/en/seller.json';
import trackEn from './locales/en/track.json';
import commonVi from './locales/vi/common.json';
import customerNotificationsVi from './locales/vi/customerNotifications.json';
import customerPortalVi from './locales/vi/customerPortal.json';
import hubVi from './locales/vi/hub.json';
import sellerVi from './locales/vi/seller.json';
import trackVi from './locales/vi/track.json';

import { type AppLanguage, DEFAULT_LANGUAGE, LANG_COOKIE, normalizeLanguage } from './constants';

export { type AppLanguage, DEFAULT_LANGUAGE, LANG_COOKIE, normalizeLanguage };

export const resources = {
  vi: { common: commonVi, customerPortal: customerPortalVi, track: trackVi, seller: sellerVi, customerNotifications: customerNotificationsVi, hub: hubVi },
  en: { common: commonEn, customerPortal: customerPortalEn, track: trackEn, seller: sellerEn, customerNotifications: customerNotificationsEn, hub: hubEn },
} as const;

export function readLanguageCookie(): AppLanguage {
  if (typeof document === 'undefined') return DEFAULT_LANGUAGE;
  const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]*)`));
  return normalizeLanguage(m ? decodeURIComponent(m[1]) : null);
}

export function writeLanguageCookie(lang: AppLanguage) {
  if (typeof document === 'undefined') return;
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

let initialised = false;
export function ensureI18n(lng: AppLanguage) {
  if (initialised) {
    if (i18n.language !== lng) void i18n.changeLanguage(lng);
    return i18n;
  }
  initialised = true;
  void i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'seller',
    ns: Object.keys(resources.vi),
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}

export default i18n;
