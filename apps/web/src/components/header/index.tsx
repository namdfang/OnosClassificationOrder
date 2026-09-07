import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Languages, LogOut, Menu as MenuIcon, Moon, Sun, User } from 'lucide-react';

import { ImpersonateQuickSwitch } from '@/components/auth/ImpersonateQuickSwitch';
import { FactoryScopeSwitch } from '@/components/header/FactoryScopeSwitch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { PATHS } from '../../constants/paths';
import { RepositoryRemote } from '../../services';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import { usePageHeaderStore } from '../../store/pageHeaderStore';
import { useThemeStore } from '../../store/themeStore';
import { handleAxiosError } from '../../utils';

interface HeaderProps {
  collapsed: boolean;
  changeCollapsed: () => void;
  isMobile?: boolean;
}

function Header({ changeCollapsed, isMobile }: HeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('layout');
  const { profile } = useAuthStore();
  const { mode, toggleMode } = useThemeStore();
  const { language, toggleLanguage } = useLanguageStore();
  const pageTitle = usePageHeaderStore((s) => s.title);
  const pageSubtitle = usePageHeaderStore((s) => s.subtitle);

  const handleLogout = async () => {
    try {
      await RepositoryRemote.auth.logout();
      useAuthStore.getState().clearToken();
      navigate(PATHS.LOGIN);
    } catch (error) {
      handleAxiosError(error);
    }
  };

  return (
    <header className="px-4 h-14 bg-background/80 backdrop-blur border-b border-border sticky top-0 z-10 flex items-center justify-between">
      {/* Desktop: nút thu gọn đã dời VÀO sidebar (cạnh logo) — header bên trái dành cho
          tiêu đề trang (`usePageHeader`). Mobile vẫn giữ nút mở menu. */}
      <div className="flex min-w-0 items-center gap-2">
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={changeCollapsed} aria-label={t('header.toggleSidebar')}>
            <MenuIcon size={18} />
          </Button>
        )}
        {pageTitle && (
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-semibold text-foreground">{pageTitle}</h1>
            {pageSubtitle && <p className="truncate text-[11px] text-muted-foreground">{pageSubtitle}</p>}
          </div>
        )}
        {/* Bộ chọn xưởng toàn cục — chỉ hiện ở /ffm/* (thay 5 cụm menu xưởng ở sidebar). */}
        <FactoryScopeSwitch />
      </div>

      <div className="flex items-center gap-1.5">
        {/* Lối vào nhanh mạo danh (AUTH-2) — tự ẩn với vai không phải SuperAdmin. */}
        <ImpersonateQuickSwitch />

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleLanguage}
          title={t('language.switch', { ns: 'common' })}
          className="gap-1 w-auto px-2"
        >
          <Languages size={16} />
          <span className="text-xs font-medium uppercase">{language}</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMode}
          title={mode === 'dark' ? t('header.lightMode') : t('header.darkMode')}
        >
          {mode === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded-md px-2 py-1 transition-colors bg-transparent border-none">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <User size={14} />
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold text-foreground leading-tight">{profile?.fullName}</span>
                <span className="text-[11px] text-muted-foreground leading-tight">
                  {profile?.role?.name || t('header.member')}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{profile?.fullName}</span>
                <span className="text-xs text-muted-foreground font-normal">{profile?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={PATHS.ACCOUNT}>
                <User size={14} />
                {t('header.myAccount')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut size={14} />
              {t('header.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export default Header;
