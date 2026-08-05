import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  BarChart3,
  Barcode,
  Bell,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  Contact,
  Factory,
  FileDown,
  FileSearch,
  LayoutGrid,
  List,
  LogOut,
  MapPin,
  Package,
  Palette,
  Rows3,
  ScanLine,
  Scissors,
  Settings,
  ShieldCheck,
  ShieldHalf,
  ShoppingCart,
  Tag,
  User,
  Users,
  Workflow,
} from 'lucide-react';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { cn } from '@/utils/cn';

import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../constants/paths';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { RepositoryRemote } from '../../services';
import { useAuthStore } from '../../store/authStore';
import { useSidebarBadgeStore } from '../../store/sidebarBadgeStore';
import { useSidebarResetStore } from '../../store/sidebarResetStore';
import { handleAxiosError } from '../../utils';

/** Badge số đếm trên 1 entry sidebar (đỏ = cần xử lý gấp, vàng = chờ gán/làm lại). */
interface SidebarBadge {
  count: number;
  tone: 'red' | 'amber';
  title: string;
}

type BadgeMap = Record<string, SidebarBadge[]>;

const SIDEBAR_BADGE_POLL_MS = 60_000;
// Mutation bump store → đợi ngắn cho các call liên tiếp (bulk) gộp 1 lần fetch.
const SIDEBAR_BADGE_DEBOUNCE_MS = 1_200;

async function fetchSidebarCounts(): Promise<void> {
  try {
    const res = await RepositoryRemote.designer.sidebarCounts();
    useSidebarBadgeStore.getState().setCounts(res.data?.data ?? null);
  } catch {
    // Poll nền — lỗi tạm thời thì giữ số cũ, không toast spam.
  }
}

function BadgePill({ badge }: { badge: SidebarBadge }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none flex items-center justify-center shrink-0',
            badge.tone === 'red' ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-950',
          )}
        >
          {badge.count}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="whitespace-pre-line">
        {badge.title}
      </TooltipContent>
    </Tooltip>
  );
}

/** Chấm màu góc icon khi sidebar thu gọn / parent thu gọn — tooltip liệt kê từng số. */
function BadgeDot({ badges }: { badges: SidebarBadge[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'absolute top-1 right-1 w-2 h-2 rounded-full',
            badges.some((b) => b.tone === 'red') ? 'bg-red-500' : 'bg-amber-400',
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="right">
        {badges.map((b) => (
          <div key={b.title}>
            {b.title}: {b.count}
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

/** Gộp badge của các entry con về 2 pill (đỏ/vàng) cho hàng parent đang đóng. */
function aggregateBadges(badges: SidebarBadge[]): SidebarBadge[] {
  const byTone = new Map<SidebarBadge['tone'], { count: number; titles: string[] }>();
  for (const b of badges) {
    const cur = byTone.get(b.tone) || { count: 0, titles: [] };
    cur.count += b.count;
    cur.titles.push(`${b.title}: ${b.count}`);
    byTone.set(b.tone, cur);
  }
  return (['red', 'amber'] as const)
    .filter((tone) => byTone.has(tone))
    .map((tone) => {
      const { count, titles } = byTone.get(tone)!;
      return { tone, count, title: titles.join('\n') };
    });
}

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
  /** Active cả khi đang ở route con của `to` (vd `/adm/settings/<section>`). */
  matchPrefix?: boolean;
}

interface NavItem {
  key: string;
  label: string;
  to?: string;
  icon: React.ReactNode;
  children?: NavChild[];
  perm?: string;
  /** Active cả khi đang ở route con của `to` (vd `/adm/settings/<section>`). */
  matchPrefix?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

function buildNavGroups(t: TFunction<'layout'>): NavGroup[] {
  return [
    {
      title: '',
      items: [
        {
          key: PATHS.HOME,
          label: t('sidebar.dashboard.title'),
          icon: <LayoutGrid size={17} />,
          perm: 'page.dashboard',
          children: [
            {
              key: 'dash-factory',
              label: t('sidebar.dashboard.factory'),
              to: `${PATHS.HOME}?tab=factory`,
              icon: <Factory size={14} />,
            },
            {
              key: 'dash-stats',
              label: t('sidebar.dashboard.stats'),
              to: `${PATHS.HOME}?tab=stats`,
              icon: <BarChart3 size={14} />,
            },
            // Entry "Tình trạng đơn hàng" TẠM ẨN (2026-07, không cần nữa) —
            // bật lại: bỏ comment + import lại ClipboardList từ lucide-react,
            // đồng bộ với tab "status" đang comment ở pages/home/index.tsx.
            // {
            //   key: 'dash-status',
            //   label: t('sidebar.dashboard.status'),
            //   to: `${PATHS.HOME}?tab=status`,
            //   icon: <ClipboardList size={14} />,
            // },
            {
              key: 'dash-lifecycle',
              label: t('sidebar.dashboard.lifecycle'),
              to: `${PATHS.HOME}?tab=lifecycle`,
              icon: <Workflow size={14} />,
            },
            {
              key: 'dash-tool-check',
              label: t('sidebar.dashboard.toolCheck'),
              to: `${PATHS.HOME}?tab=tool-check`,
              icon: <FileSearch size={14} />,
              perm: 'page.tool_check',
            },
            // Entry "Lỗi theo người" TẠM ẨN (2026-07, không cần nữa) — đồng bộ
            // với tab "person-error" đang comment ở pages/home/index.tsx.
            // {
            //   key: 'dash-person-error',
            //   label: t('sidebar.dashboard.personError'),
            //   to: `${PATHS.HOME}?tab=person-error`,
            //   icon: <AlertTriangle size={14} />,
            //   anyPerm: ['page.designer_stats', 'page.tool_check'],
            // },
            {
              key: 'dash-designer',
              label: t('sidebar.dashboard.designer'),
              to: `${PATHS.HOME}?tab=designer`,
              icon: <Palette size={14} />,
              perm: 'page.designer_stats',
            },
          ],
        },
        {
          key: PATHS.ORDERS,
          label: t('sidebar.orders.title'),
          icon: <ShoppingCart size={17} />,
          perm: 'page.orders',
          children: [
            // "List Order" (tab cũ) đang tạm tắt (xem pages/orders/ListOrderTab.tsx)
            // — thay bằng "Danh sách đơn", đúng trang default thật hiện tại.
            {
              key: 'orders-workshop',
              label: t('sidebar.orders.list'),
              to: PATHS.ORDERS_WORKSHOP,
              icon: <List size={14} />,
            },
            {
              key: 'orders-error-log',
              label: t('sidebar.orders.errorLog'),
              to: PATHS.ORDERS_ERROR_LOG,
              icon: <AlertTriangle size={14} />,
              hideForRoles: ['Support'],
            },
            {
              key: 'orders-scan-error',
              label: t('sidebar.orders.scanError'),
              to: PATHS.ORDERS_SCAN_ERROR,
              icon: <ScanLine size={14} />,
              perm: 'page.scan_error',
            },
            {
              key: 'orders-stage-errors',
              label: t('sidebar.orders.stageErrors'),
              to: PATHS.ORDERS_STAGE_ERRORS,
              icon: <Barcode size={14} />,
              perm: 'page.stage_errors',
            },
            {
              key: 'orders-unmapped',
              label: t('sidebar.orders.unmapped'),
              to: PATHS.ORDERS_UNMAPPED,
              icon: <MapPin size={14} />,
              perm: 'page.unmapped_factory',
            },
            {
              key: 'orders-import',
              label: t('sidebar.orders.import'),
              to: PATHS.ORDERS_IMPORT,
              icon: <FileDown size={14} />,
              perm: 'order.import',
            },
            {
              key: 'orders-cutting-files',
              label: t('sidebar.orders.cuttingFiles'),
              to: PATHS.ORDERS_CUTTING_FILES,
              icon: <Scissors size={14} />,
              perm: 'order.import',
            },
          ],
        },
        {
          key: 'work',
          label: t('sidebar.work.title'),
          icon: <Briefcase size={17} />,
          children: [
            {
              key: PATHS.MY_TASKS,
              label: t('sidebar.work.myTasks'),
              to: PATHS.MY_TASKS,
              icon: <List size={14} />,
              perm: 'page.my_tasks',
            },
            {
              key: PATHS.FULFILLMENT_MY_TASKS,
              label: t('sidebar.work.fulfillmentTasks'),
              to: PATHS.FULFILLMENT_MY_TASKS,
              icon: <Factory size={14} />,
              perm: 'page.fulfillment_my_tasks',
            },
          ],
        },
      ],
    },
    {
      // Nhóm menu RIÊNG cho "Đơn hàng" (bảng phẳng, phân trang THẬT, KHÔNG gộp
      // theo sản phẩm — khác "Danh sách đơn" ở nhóm trên dùng getOrdersGrouped).
      // Cùng cột/filter/bulk với Workshop, chỉ khác cách hiển thị + KHÔNG có
      // Designer Summary. Xem OrderTableClassic.tsx.
      title: t('sidebar.groups.orders'),
      items: [
        {
          key: PATHS.ORDERS_CLASSIC,
          label: t('sidebar.orders.classic'),
          to: PATHS.ORDERS_CLASSIC,
          icon: <Rows3 size={17} />,
          perm: 'page.orders',
        },
      ],
    },
    {
      title: t('sidebar.groups.catalog'),
      items: [
        {
          key: PATHS.PRODUCTS,
          label: t('sidebar.products'),
          to: PATHS.PRODUCTS,
          icon: <Package size={17} />,
          perm: 'page.products',
        },
        {
          key: PATHS.PROMOTIONS,
          label: t('sidebar.promotions'),
          to: PATHS.PROMOTIONS,
          icon: <Tag size={17} />,
          perm: 'page.promotions',
        },
        {
          key: PATHS.WORKSHOP_CONFIG,
          label: t('sidebar.workshopConfig'),
          to: PATHS.WORKSHOP_CONFIG,
          icon: <Building2 size={17} />,
          perm: 'workshop.manage',
        },
      ],
    },
    {
      title: t('sidebar.groups.personal'),
      items: [
        {
          key: PATHS.NOTIFICATIONS,
          label: t('sidebar.notifications'),
          to: PATHS.NOTIFICATIONS,
          icon: <Bell size={17} />,
        },
        { key: PATHS.ACCOUNT, label: t('sidebar.account'), to: PATHS.ACCOUNT, icon: <User size={17} /> },
      ],
    },
    {
      title: t('sidebar.groups.admin'),
      items: [
        {
          key: 'admin-people',
          label: t('sidebar.peoplePermissions'),
          icon: <Users size={17} />,
          children: [
            {
              key: PATHS.DESIGNER_TEAM,
              label: t('sidebar.designerTeam'),
              to: PATHS.DESIGNER_TEAM,
              icon: <Palette size={14} />,
              perm: 'page.designer_team',
            },
            {
              key: PATHS.USERS,
              label: t('sidebar.users'),
              to: PATHS.USERS,
              icon: <User size={14} />,
              perm: 'user.manage',
            },
            {
              key: PATHS.DEPARTMENTS,
              label: t('sidebar.departments'),
              to: PATHS.DEPARTMENTS,
              icon: <Building2 size={14} />,
              perm: 'user.manage',
            },
            {
              key: PATHS.ROLES,
              label: t('sidebar.roles'),
              to: PATHS.ROLES,
              icon: <ShieldCheck size={14} />,
              perm: 'role.manage',
            },
            {
              key: PATHS.CUSTOM_ROLES,
              label: t('sidebar.customRoles'),
              to: PATHS.CUSTOM_ROLES,
              icon: <ShieldHalf size={14} />,
              perm: 'role.manage',
            },
          ],
        },
        {
          key: PATHS.CUSTOMERS,
          label: t('sidebar.customers'),
          to: PATHS.CUSTOMERS,
          icon: <Contact size={17} />,
          perm: 'page.customers',
        },
        {
          key: PATHS.SETTINGS,
          label: t('sidebar.settings'),
          to: PATHS.SETTINGS,
          icon: <Settings size={17} />,
          perm: 'role.manage',
          matchPrefix: true,
        },
      ],
    },
  ];
}

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

function isLinkActive(linkPath: string, currentPath: string, currentSearch: string, matchPrefix = false): boolean {
  // linkPath may include `?...` for children
  const [pathPart, queryPart] = linkPath.split('?');
  const pathMatches = matchPrefix
    ? currentPath === pathPart || currentPath.startsWith(`${pathPart}/`)
    : pathPart === currentPath;
  if (!pathMatches) return false;
  if (!queryPart) return true;
  // exact query param subset check
  const linkParams = new URLSearchParams(queryPart);
  const currentParams = new URLSearchParams(currentSearch);
  for (const [k, v] of linkParams.entries()) {
    if (currentParams.get(k) !== v) return false;
  }
  return true;
}

function SidebarLeaf({
  item,
  collapsed,
  level = 0,
  badges,
}: {
  item: NavChild;
  collapsed: boolean;
  level?: number;
  badges?: SidebarBadge[];
}) {
  const location = useLocation();
  const active = isLinkActive(item.to, location.pathname, location.search, item.matchPrefix);
  const requestReset = useSidebarResetStore((s) => s.requestReset);
  const hasBadges = !!badges?.length;
  return (
    <Link
      to={item.to}
      // Click lại menu ĐANG active → Router coi là no-op (không điều hướng),
      // nên phát tín hiệu riêng để trang tự xóa filter (xem `useSidebarResetSignal`).
      onClick={() => {
        if (active) requestReset(item.to);
      }}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        collapsed && 'justify-center relative',
        !collapsed && level > 0 && 'ml-5 py-1.5 text-[13px]',
      )}
    >
      <span className={active ? 'text-foreground' : 'text-muted-foreground'}>{item.icon}</span>
      {!collapsed && <span className={cn('truncate', hasBadges && 'flex-1')}>{item.label}</span>}
      {!collapsed && hasBadges && (
        <span className="flex items-center gap-1 shrink-0">
          {badges!.map((b) => (
            <BadgePill key={b.title} badge={b} />
          ))}
        </span>
      )}
      {collapsed && hasBadges && <BadgeDot badges={badges!} />}
    </Link>
  );
}

function SidebarParent({ item, collapsed, badgeMap }: { item: NavItem; collapsed: boolean; badgeMap: BadgeMap }) {
  const location = useLocation();
  const hasChildren = !!item.children?.length;
  const childBadges = hasChildren ? item.children!.flatMap((c) => badgeMap[c.key] || []) : [];

  // Open by default if any child matches current path
  const initialOpen = hasChildren
    ? item.children!.some((c) => isLinkActive(c.to, location.pathname, location.search, c.matchPrefix))
    : false;
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    // Auto-expand when navigating to a child
    if (
      hasChildren &&
      item.children!.some((c) => isLinkActive(c.to, location.pathname, location.search, c.matchPrefix))
    ) {
      setOpen(true);
    }
  }, [location.pathname, location.search]);

  if (!hasChildren && item.to) {
    return <SidebarLeaf item={item as NavChild} collapsed={collapsed} badges={badgeMap[item.key]} />;
  }

  // Parent with children
  const anyChildActive = item.children!.some((c) =>
    isLinkActive(c.to, location.pathname, location.search, c.matchPrefix),
  );

  if (collapsed) {
    // Collapsed: show parent icon only; clicking still navigates to first child
    return (
      <Link
        to={item.children![0].to}
        title={item.label}
        className={cn(
          'flex items-center justify-center px-3 py-2 rounded-md text-sm transition-colors relative',
          anyChildActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
      >
        <span className={anyChildActive ? 'text-foreground' : 'text-muted-foreground'}>{item.icon}</span>
        {childBadges.length > 0 && <BadgeDot badges={childBadges} />}
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
        {!open && childBadges.length > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            {aggregateBadges(childBadges).map((b) => (
              <BadgePill key={b.tone} badge={b} />
            ))}
          </span>
        )}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="space-y-0.5 mt-0.5">
          {item.children!.map((c) => (
            <SidebarLeaf key={c.key} item={c} collapsed={false} level={1} badges={badgeMap[c.key]} />
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ collapsed, mobileOpen, onMobileClose }: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('layout');
  const { profile } = useAuthStore();
  const isMobile = useIsMobile();

  const roleName = profile?.role?.name as string | undefined;
  const isAdmin = roleName === 'Admin' || roleName === 'SuperAdmin';
  const permissionCodes = useMemo(
    () => new Set<string>(profile?.role?.permissionCodes || []),
    [profile?.role?.permissionCodes],
  );
  const navGroups = useMemo(
    () => filterMenuByPermissions(buildNavGroups(t), permissionCodes, isAdmin, roleName),
    [t, permissionCodes, isAdmin, roleName],
  );

  const counts = useSidebarBadgeStore((s) => s.counts);
  const refreshRequestedAt = useSidebarBadgeStore((s) => s.refreshRequestedAt);
  const profileId = profile?._id;

  // Polling nhẹ 60s (chỉ khi tab đang hiển thị) — endpoint count-only, vài chục ms.
  useEffect(() => {
    if (!profileId) return;
    fetchSidebarCounts();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchSidebarCounts();
    }, SIDEBAR_BADGE_POLL_MS);
    return () => clearInterval(id);
  }, [profileId]);

  // Mutation liên quan vừa thành công (bump từ axios interceptor) → refetch ngay
  // sau debounce ngắn để số giảm liền khi chính user làm xong task.
  useEffect(() => {
    if (!profileId || !refreshRequestedAt) return;
    const timer = setTimeout(fetchSidebarCounts, SIDEBAR_BADGE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [profileId, refreshRequestedAt]);

  const badgeMap = useMemo<BadgeMap>(() => {
    if (!counts) return {};
    const map: BadgeMap = {};
    const add = (key: string, count: number | null | undefined, tone: SidebarBadge['tone'], title: string) => {
      if (typeof count !== 'number' || count <= 0) return;
      (map[key] ||= []).push({ count, tone, title });
    };
    // Nhật ký bù lỗi: số theo góc nhìn chặng của viewer (Fulfillment/Designer =
    // việc của mình; Admin/Manager = toàn hệ thống) — title đổi theo cho đúng nghĩa.
    const personalErrorView = roleName === 'Fulfillment' || roleName === 'Designer' || roleName === 'DesignerLeader';
    add(
      'orders-error-log',
      counts.errorLogTodo,
      'red',
      personalErrorView ? t('sidebar.badges.errorLogTodo') : t('sidebar.badges.errorLogTodoAll'),
    );
    add('dash-designer', counts.designerUnassigned, 'amber', t('sidebar.badges.designerUnassigned'));
    add(
      'dash-designer',
      counts.designerBacklog,
      'red',
      roleName === 'Designer' ? t('sidebar.badges.designerBacklogSelf') : t('sidebar.badges.designerBacklog'),
    );
    add('dash-tool-check', counts.toolCheckRework, 'amber', t('sidebar.badges.toolCheckRework'));
    add('dash-tool-check', counts.toolCheckUnreviewed, 'red', t('sidebar.badges.toolCheckUnreviewed'));
    return map;
  }, [counts, roleName, t]);

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
    // TooltipProvider cho tooltip badge (BadgePill/BadgeDot) — delay ngắn để
    // hover là thấy ngay con số nghĩa là gì.
    <TooltipProvider delayDuration={150}>
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
                  <SidebarParent key={item.key} item={item} collapsed={!showLabels} badgeMap={badgeMap} />
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
              <p className="text-[11px] text-muted-foreground truncate">{profile?.role?.name || t('sidebar.member')}</p>
            </div>
            <button
              onClick={handleLogout}
              title={t('sidebar.signOut')}
              className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors bg-transparent border-none cursor-pointer"
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </TooltipProvider>
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
