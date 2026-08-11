import dayjs from 'dayjs';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import i18n, { type AppLanguage, DEFAULT_LANGUAGE } from '@/i18n';

interface LanguageStore {
    language: AppLanguage;
    setLanguage: (language: AppLanguage) => void;
    toggleLanguage: () => void;
}

export const useLanguageStore = create<LanguageStore>()(
    persist(
        (set, get) => ({
            language: DEFAULT_LANGUAGE,
            setLanguage: (language) => {
                set({ language });
                applyLanguage(language);
            },
            toggleLanguage: () => {
                const next = get().language === 'vi' ? 'en' : 'vi';
                set({ language: next });
                applyLanguage(next);
            },
        }),
        {
            name: 'onosfactory-language',
        },
    ),
);

function applyLanguage(language: AppLanguage) {
    i18n.changeLanguage(language);
    dayjs.locale(language);
    document.documentElement.lang = language;
}
