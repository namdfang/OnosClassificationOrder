import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Languages, Menu, X } from 'lucide-react';

import { PATHS } from '@/constants/paths';

import { useLanguageStore } from '@/store/languageStore';

import { cn } from '@/utils/cn';

import logoUrl from '@/assets/images/logo.png';

import PillLink from './PillLink';

/**
 * Header dùng chung cho các trang public (`/` và `/catalog`).
 *
 * `hash` = mục neo tới 1 section của trang chủ; `to` = mục điều hướng sang route
 * khác. Khi đang đứng ngoài trang chủ, mục neo tự đổi thành `/#...` để quay về
 * trang chủ rồi mới cuộn — nếu để nguyên `#...` thì bấm sẽ không có tác dụng.
 */
const NAV_ITEMS: { key: string; hash?: string; to?: string }[] = [
  { key: 'catalog', to: PATHS.CATALOG },
  { key: 'how', hash: '#how' },
  { key: 'why', hash: '#why' },
  { key: 'quality', hash: '#quality' },
  { key: 'team', hash: '#team' },
];

function PublicHeader() {
  const { t } = useTranslation('landing');
  const { pathname } = useLocation();
  const { language, toggleLanguage } = useLanguageStore();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isLanding = pathname === PATHS.LANDING;
  const hashHref = (hash: string) => (isLanding ? hash : `${PATHS.LANDING}${hash}`);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // `whitespace-nowrap`: không có nó, nhãn 2 chữ như "Cách đặt đơn" bị ngắt
  // giữa chừng làm thanh nav cao gấp đôi.
  const navLinkClass =
    'whitespace-nowrap text-[0.72rem] font-bold uppercase tracking-[0.1em] text-[#0f110f] transition-colors hover:text-brand-600';

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-shadow duration-300',
        scrolled ? 'bg-white/90 shadow-sm backdrop-blur' : 'bg-white',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 lg:h-20">
        <Link to={PATHS.LANDING} className="flex shrink-0 items-center gap-2.5" aria-label={t('brand.name')}>
          <img src={logoUrl} alt="" className="h-7 w-auto object-contain lg:h-8" />
          <span className="hidden font-display text-lg font-medium tracking-tight text-[#0f110f] sm:block">
            {t('brand.name')}
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-5 lg:flex xl:gap-7" aria-label={t('brand.name')}>
          {NAV_ITEMS.map((item) =>
            item.to ? (
              <Link key={item.key} to={item.to} className={navLinkClass}>
                {t(`nav.${item.key}`)}
              </Link>
            ) : (
              <a key={item.key} href={hashHref(item.hash as string)} className={navLinkClass}>
                {t(`nav.${item.key}`)}
              </a>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-4">
          <button
            type="button"
            onClick={toggleLanguage}
            aria-label={t('actions.switchLanguage')}
            className="flex items-center gap-1 rounded-full px-2 py-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0f110f]"
          >
            <Languages size={16} />
            <span className="text-[0.7rem] font-bold uppercase">{language}</span>
          </button>

          <Link to={PATHS.CUSTOMER_LOGIN} className={cn('hidden sm:block', navLinkClass)}>
            {t('actions.customerSignIn')}
          </Link>

          <PillLink to={PATHS.CUSTOMER_REGISTER} size="sm" className="hidden sm:inline-flex">
            {t('actions.order')}
          </PillLink>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={t('actions.menu')}
            aria-expanded={menuOpen}
            className="rounded-full p-2 text-[#0f110f] transition-colors hover:bg-slate-100 lg:hidden"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-100 bg-white px-4 py-4 lg:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const className =
                'rounded-lg px-3 py-2.5 text-sm font-semibold text-[#0f110f] transition-colors hover:bg-slate-50 hover:text-brand-600';
              return item.to ? (
                <Link key={item.key} to={item.to} onClick={() => setMenuOpen(false)} className={className}>
                  {t(`nav.${item.key}`)}
                </Link>
              ) : (
                <a
                  key={item.key}
                  href={hashHref(item.hash as string)}
                  onClick={() => setMenuOpen(false)}
                  className={className}
                >
                  {t(`nav.${item.key}`)}
                </a>
              );
            })}
          </nav>

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
            <PillLink to={PATHS.CUSTOMER_REGISTER} size="sm" className="w-full">
              {t('actions.order')}
            </PillLink>
            <PillLink to={PATHS.CUSTOMER_LOGIN} variant="outline" size="sm" className="w-full">
              {t('actions.customerSignIn')}
            </PillLink>
            <Link
              to={PATHS.LOGIN}
              className="mt-1 text-center text-xs text-slate-400 transition-colors hover:text-brand-600"
            >
              {t('actions.staffSignInLong')}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export default PublicHeader;
