import type { TFunction } from 'i18next';
import { PRODUCT_LINES, productLineHref } from '@/lib/product-lines';

export interface NavItem {
  id: string;
  /** Emoji hoặc ký tự — khuôn thghub dùng emoji cho nav. */
  icon: string;
  label: string;
  href: string;
  badge?: number;
  /** Có con → `CollapsibleNavItem` (cha chỉ toggle, không điều hướng). */
  children?: NavItem[];
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

const LINE_ICONS: Record<string, string> = {
  '3d': '🧢',
  '2d': '👕',
  wood: '🪵',
  embroidery: '🧵',
  led: '💡',
  canvas: '🖼️',
};

/** Nav cổng seller — nhãn qua i18n nên phải build trong component (nhận `t`). */
export function buildCustomerNav(t: TFunction): NavGroup[] {
  return [
    {
      group: t('nav.groupMain', { ns: 'seller' }),
      items: [
        { id: 'dashboard', icon: '📊', label: t('nav.dashboard', { ns: 'seller' }), href: '/portal' },
        { id: 'catalog', icon: '🗂️', label: t('nav.catalog', { ns: 'seller' }), href: '/portal/catalog' },
        {
          id: 'orders',
          icon: '📦',
          label: t('nav.orders', { ns: 'seller' }),
          href: '/portal/orders',
          children: PRODUCT_LINES.map((line) => ({
            id: `orders_${line}`,
            icon: LINE_ICONS[line] ?? '•',
            label: t(`productLines.${line}`, { ns: 'customerPortal' }),
            href: productLineHref(line),
          })),
        },
      ],
    },
    {
      group: t('nav.groupAccount', { ns: 'seller' }),
      items: [
        { id: 'wallet', icon: '💰', label: t('nav.wallet', { ns: 'seller' }), href: '/portal/wallet' },
        { id: 'account', icon: '👤', label: t('nav.account', { ns: 'seller' }), href: '/portal/account' },
        { id: 'api', icon: '🔌', label: t('nav.api', { ns: 'seller' }), href: '/portal/api' },
      ],
    },
  ];
}

/** Khớp cụ thể nhất thắng (`/portal/orders/3d` thắng `/portal/orders`) — copy thghub. */
export function hrefDangChon(pathname: string, hrefs: string[]): string | null {
  let tot: string | null = null;
  for (const h of hrefs) {
    if (!h) continue;
    const khop = h === '/portal' || h === '/hub' || h === '/hub/orders' ? pathname === h : pathname === h || pathname.startsWith(`${h}/`);
    if (!khop) continue;
    if (!tot || h.length > tot.length) tot = h;
  }
  return tot;
}

/** Nav khu quản trị `/hub` — Orders xổ "Tất cả" + 6 dịch vụ, cùng khuôn với cổng seller. */
export function buildHubNav(t: TFunction): NavGroup[] {
  return [
    {
      group: t('nav.group', { ns: 'hub' }),
      items: [
        { id: 'hub_overview', icon: '📊', label: t('nav.dashboard', { ns: 'hub' }), href: '/hub' },
        {
          id: 'hub_orders',
          icon: '📦',
          label: t('nav.orders', { ns: 'hub' }),
          href: '/hub/orders',
          children: [
            { id: 'hub_orders_all', icon: '🗂️', label: t('nav.ordersAll', { ns: 'hub' }), href: '/hub/orders' },
            ...PRODUCT_LINES.map((line) => ({
              id: `hub_orders_${line}`,
              icon: LINE_ICONS[line] ?? '•',
              label: t(`productLines.${line}`, { ns: 'customerPortal' }),
              href: `/hub/orders/${line}`,
            })),
          ],
        },
        { id: 'hub_operations', icon: '🏭', label: t('nav.operations', { ns: 'hub' }), href: '/hub/operations' },
        { id: 'hub_sellers', icon: '👥', label: t('nav.sellers', { ns: 'hub' }), href: '/hub/sellers' },
        { id: 'hub_wallets', icon: '💰', label: t('nav.wallets', { ns: 'hub' }), href: '/hub/wallets' },
        { id: 'hub_notifications', icon: '🔔', label: t('nav.notifications', { ns: 'hub' }), href: '/hub/notifications' },
      ],
    },
  ];
}
