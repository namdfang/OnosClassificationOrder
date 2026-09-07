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
      items: [{ id: 'account', icon: '👤', label: t('nav.account', { ns: 'seller' }), href: '/portal/account' }],
    },
  ];
}

/** Khớp cụ thể nhất thắng (`/portal/orders/3d` thắng `/portal/orders`) — copy thghub. */
export function hrefDangChon(pathname: string, hrefs: string[]): string | null {
  let tot: string | null = null;
  for (const h of hrefs) {
    if (!h) continue;
    const khop = h === '/portal' ? pathname === h : pathname === h || pathname.startsWith(`${h}/`);
    if (!khop) continue;
    if (!tot || h.length > tot.length) tot = h;
  }
  return tot;
}
