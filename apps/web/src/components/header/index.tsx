import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu as MenuIcon, Moon, PanelLeft, PanelLeftClose, Sun, User } from 'lucide-react';

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
import { useThemeStore } from '../../store/themeStore';
import { handleAxiosError } from '../../utils';

interface HeaderProps {
  collapsed: boolean;
  changeCollapsed: () => void;
  isMobile?: boolean;
}

function Header({ collapsed, changeCollapsed, isMobile }: HeaderProps) {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { mode, toggleMode } = useThemeStore();

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
      <Button variant="ghost" size="icon" onClick={changeCollapsed} aria-label="Toggle sidebar">
        {isMobile ? <MenuIcon size={18} /> : collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
      </Button>

      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" onClick={toggleMode} title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
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
                  {profile?.role?.name || 'Member'}
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
                My account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut size={14} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export default Header;
