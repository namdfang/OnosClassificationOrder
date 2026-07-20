import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Factory,
  FileDown,
  FileSearch,
  LayoutGrid,
  List,
  LogOut,
  MapPin,
  Package,
  Palette,
  ScanLine,
  Scissors,
  Settings,
  ShieldCheck,
  ShieldHalf,
  ShoppingCart,
  User,
  Users,
  Workflow,
} from 'lucide-react';

import { Sheet, SheetContent } from '@/components/ui/sheet';

import { cn } from '@/utils/cn';

import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../constants/paths';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { RepositoryRemote } from '../../services';
import { useAuthStore } from '../../store/authStore';
import { handleAxiosError } from '../../utils';

interface NavChild {
  key: string;
  label: string;
  to: string;
  icon: React.ReactNode;
  /** Permission code from PERMISSION_CATALOG. Empty = always visible. */
  perm?: string;
  /** Hiện khi user có BẤT KỲ perm nào trong danh sách (điều kiện OR, thay cho `perm`). */
  anyPerm?: string[];
  /** Role names to hide this entry from (bổ sung cho check `perm`). */
  hideForRoles?: string[];
}

interface NavItem {
  key: string;
  label: string;
  to?: string;
  icon: React.ReactNode;
  children?: NavChild[];
  perm?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: '',
    items: [
      {
        key: PATHS.HOME,
        label: 'Dashboard',
        icon: <LayoutGrid size={17} />,
        perm: 'page.dashboard',
        children: [
          { key: 'dash-factory', label: 'Đơn hàng theo xưởng', to: `${PATHS.HOME}?tab=factory`, icon: <Factory size={14} /> },
          { key: 'dash-stats', label: 'Thống kê đơn & sản phẩm', to: `${PATHS.HOME}?tab=stats`, icon: <BarChart3 size={14} /> },
          { key: 'dash-status', label: 'Tình trạng đơn hàng', to: `${PATHS.HOME}?tab=status`, icon: <ClipboardList size={14} /> },
          { key: 'dash-lifecycle', label: 'Vòng đời đơn', to: `${PATHS.HOME}?tab=lifecycle`, icon: <Workflow size={14} /> },
          {
            key: 'dash-tool-check',
            label: 'Soát tool',
            to: `${PATHS.HOME}?tab=tool-check`,
            icon: <FileSearch size={14} />,
            perm: 'page.tool_check',
          },
          {
            key: 'dash-person-error',
            label: 'Lỗi theo người',
            to: `${PATHS.HOME}?tab=person-error`,
            icon: <AlertTriangle size={14} />,
            anyPerm: ['page.designer_stats', 'page.tool_check'],
          },
          {
            key: 'dash-designer',
            label: 'Designer',
            to: `${PATHS.HOME}?tab=designer`,
            icon: <Palette size={14} />,
            perm: 'page.designer_stats',
          },
        ],
      },
      {
        key: PATHS.ORDERS,
        label: 'Quản lý đơn',
        icon: <ShoppingCart size={17} />,
        perm: 'page.orders',
        children: [
          // "List Order" (tab cũ) đang tạm tắt (xem pages/orders/ListOrderTab.tsx)
          // — thay bằng "Danh sách đơn", đúng trang default thật hiện tại.
          { key: 'orders-workshop', label: 'Danh sách đơn', to: PATHS.ORDERS_WORKSHOP, icon: <List size={14} /> },
          {
            key: 'orders-error-log',
            label: 'Nhật ký bù lỗi',
            to: PATHS.ORDERS_ERROR_LOG,
            icon: <AlertTriangle size={14} />,
            hideForRoles: ['Support'],
          },
          {
            key: 'orders-scan-error',
            label: 'Quét mã',
            to: PATHS.ORDERS_SCAN_ERROR,
            icon: <ScanLine size={14} />,
            perm: 'page.scan_error',
          },
          {
            key: 'orders-unmapped',
            label: 'Không xác định xưởng',
            to: PATHS.ORDERS_UNMAPPED,
            icon: <MapPin size={14} />,
            perm: 'page.unmapped_factory',
          },
          {
            key: 'orders-import',
            label: 'Import Order',
            to: PATHS.ORDERS_IMPORT,
            icon: <FileDown size={14} />,
            perm: 'order.import',
          },
          {
            key: 'orders-cutting-files',
            label: 'Import File Cutting',
            to: PATHS.ORDERS_CUTTING_FILES,
            icon: <Scissors size={14} />,
            perm: 'order.import',
          },
        ],
      },
      {
        key: 'work',
        label: 'Công việc',
        icon: <Briefcase size={17} />,
        children: [
          {
            key: PATHS.MY_TASKS,
            label: 'Task của tôi',
            to: PATHS.MY_TASKS,
            icon: <List size={14} />,
            perm: 'page.my_tasks',
          },
          {
            key: PATHS.FULFILLMENT_MY_TASKS,
            label: 'Task Fulfillment',
            to: PATHS.FULFILLMENT_MY_TASKS,
            icon: <Factory size={14} />,
            perm: 'page.fulfillment_my_tasks',
          },
        ],
      },
    ],
  },
  {
    title: 'Danh mục',
    items: [
      {
        key: PATHS.PRODUCTS,
        label: 'Sản phẩm',
        to: PATHS.PRODUCTS,
        icon: <Package size={17} />,
        perm: 'page.products',
      },
      {
        key: PATHS.WORKSHOP_CONFIG,
        label: 'Quản lý xưởng',
        to: PATHS.WORKSHOP_CONFIG,
        icon: <Building2 size={17} />,
        perm: 'workshop.manage',
      },
    ],
  },
  {
    title: 'Cá nhân',
    items: [
      { key: PATHS.NOTIFICATIONS, label: 'Thông báo', to: PATHS.NOTIFICATIONS, icon: <Bell size={17} /> },
      { key: PATHS.ACCOUNT, label: 'Tài khoản', to: PATHS.ACCOUNT, icon: <User size={17} /> },
    ],
  },
  {
    title: 'Quản trị',
    items: [
      {
        key: 'admin-people',
        label: 'Nhân sự & phân quyền',
        icon: <Users size={17} />,
        children: [
          {
            key: PATHS.DESIGNER_TEAM,
            label: 'Team Designer',
            to: PATHS.DESIGNER_TEAM,
            icon: <Palette size={14} />,
            perm: 'page.designer_team',
          },
          { key: PATHS.USERS, label: 'Người dùng', to: PATHS.USERS, icon: <User size={14} />, perm: 'user.manage' },
          {
            key: PATHS.DEPARTMENTS,
            label: 'Phòng ban',
            to: PATHS.DEPARTMENTS,
            icon: <Building2 size={14} />,
            perm: 'user.manage',
          },
          { key: PATHS.ROLES, label: 'Vai trò', to: PATHS.ROLES, icon: <ShieldCheck size={14} />, perm: 'role.manage' },
          {
            key: PATHS.CUSTOM_ROLES,
            label: 'Vai trò tùy chỉnh',
            to: PATHS.CUSTOM_ROLES,
            icon: <ShieldHalf size={14} />,
            perm: 'role.manage',
          },
        ],
      },
      { key: PATHS.SETTINGS, label: 'Cài đặt', to: PATHS.SETTINGS, icon: <Settings size={17} />, perm: 'role.manage' },
    ],
  },
];

/**
 * Filter sidebar menu by user.role.permissionCodes. Items without `perm` are
 * always visible (account, notifications). Empty permissionCodes (e.g. fresh
 * user / token from old session) → only no-perm items appear.
 *
 * SuperAdmin / Admin role names get an explicit bypass since their token may
 * predate the Phase 5 permissionCodes seed.
 */
function filterMenuByPermissions(
  groups: NavGroup[],
  codes: Set<string>,
  isAdmin: boolean,
  roleName?: string,
): NavGroup[] {
  const allow = (perm?: string, anyPerm?: string[]) => {
    if (isAdmin) return true;
    if (anyPerm?.length) return anyPerm.some((p) => codes.has(p));
    return !perm || codes.has(perm);
  };
  const visibleForRole = (c: NavChild) => !(roleName && c.hideForRoles?.includes(roleName));
  return groups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((it) => allow(it.perm))
        .map((it) =>
          it.children
            ? { ...it, children: it.children.filter((c) => allow(c.perm, c.anyPerm) && visibleForRole(c)) }
            : it,
        )
        .filter((it) => !it.children || it.children.length > 0),
    }))
    .filter((g) => g.items.length > 0);
}

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function isLinkActive(linkPath: string, currentPath: string, currentSearch: string): boolean {
  // linkPath may include `?...` for children
  const [pathPart, queryPart] = linkPath.split('?');
  if (pathPart !== currentPath) return false;
  if (!queryPart) return true;
  // exact query param subset check
  const linkParams = new URLSearchParams(queryPart);
  const currentParams = new URLSearchParams(currentSearch);
  for (const [k, v] of linkParams.entries()) {
    if (currentParams.get(k) !== v) return false;
  }
  return true;
}

function SidebarLeaf({ item, collapsed, level = 0 }: { item: NavChild; collapsed: boolean; level?: number }) {
  const location = useLocation();
  const active = isLinkActive(item.to, location.pathname, location.search);
  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        collapsed && 'justify-center',
        !collapsed && level > 0 && 'ml-5 py-1.5 text-[13px]',
      )}
    >
      <span className={active ? 'text-foreground' : 'text-muted-foreground'}>{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function SidebarParent({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation();
  const hasChildren = !!item.children?.length;

  // Open by default if any child matches current path
  const initialOpen = hasChildren
    ? item.children!.some((c) => isLinkActive(c.to, location.pathname, location.search))
    : false;
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    // Auto-expand when navigating to a child
    if (hasChildren && item.children!.some((c) => isLinkActive(c.to, location.pathname, location.search))) {
      setOpen(true);
    }
  }, [location.pathname, location.search]);

  if (!hasChildren && item.to) {
    return <SidebarLeaf item={item as NavChild} collapsed={collapsed} />;
  }

  // Parent with children
  const anyChildActive = item.children!.some((c) => isLinkActive(c.to, location.pathname, location.search));

  if (collapsed) {
    // Collapsed: show parent icon only; clicking still navigates to first child
    return (
      <Link
        to={item.children![0].to}
        title={item.label}
        className={cn(
          'flex items-center justify-center px-3 py-2 rounded-md text-sm transition-colors',
          anyChildActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
      >
        <span className={anyChildActive ? 'text-foreground' : 'text-muted-foreground'}>{item.icon}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left bg-transparent border-none cursor-pointer',
          anyChildActive
            ? 'text-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
      >
        <span className={anyChildActive ? 'text-foreground' : 'text-muted-foreground'}>{item.icon}</span>
        <span className="truncate flex-1">{item.label}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="space-y-0.5 mt-0.5">
          {item.children!.map((c) => (
            <SidebarLeaf key={c.key} item={c} collapsed={false} level={1} />
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ collapsed, mobileOpen, onMobileClose }: SidebarProps) {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const isMobile = useIsMobile();

  const roleName = profile?.role?.name as string | undefined;
  const isAdmin = roleName === 'Admin' || roleName === 'SuperAdmin';
  const permissionCodes = useMemo(
    () => new Set<string>(profile?.role?.permissionCodes || []),
    [profile?.role?.permissionCodes],
  );
  const navGroups = useMemo(
    () => filterMenuByPermissions(NAV_GROUPS, permissionCodes, isAdmin, roleName),
    [permissionCodes, isAdmin, roleName],
  );

  const handleLogout = async () => {
    try {
      await RepositoryRemote.auth.logout();
      useAuthStore.getState().clearToken();
      navigate(PATHS.LOGIN);
    } catch (error) {
      handleAxiosError(error);
    }
  };

  const showLabels = !collapsed || isMobile;

  const renderContent = () => (
    <div className="flex flex-col h-full bg-background">
      <div
        className={cn('flex items-center gap-2.5 h-16 px-4 border-b border-border', !showLabels && 'justify-center')}
      >
        {showLabels ? (
          <img src={logoUrl} alt="Logo" className="h-7 w-auto object-contain" />
        ) : (
          <img src={logoUrl} alt="Logo" className="h-6 w-auto object-contain" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-5">
        {navGroups.map((group, idx) => (
          <div key={group.title || `group-${idx}`}>
            {showLabels && group.title && (
              <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarParent key={item.key} item={item} collapsed={!showLabels} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showLabels && profile && (
        <div className="border-t border-border p-3 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <User size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{profile?.fullName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{profile?.role?.name || 'Member'}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors bg-transparent border-none cursor-pointer"
          >
            <LogOut size={15} />
          </button>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose()}>
        <SheetContent side="left" className="p-0 w-[260px]">
          {renderContent()}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={cn(
        'border-r border-border bg-background transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-[240px]',
      )}
    >
      {renderContent()}
    </aside>
  );
}

export default Sidebar;
