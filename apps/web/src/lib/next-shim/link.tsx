import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

/**
 * Shim `next/link` cho app Vite.
 *
 * Vì sao cần: gói giao diện Zalo của nhà cung cấp viết cho Next.js và import
 * `next/link` ở mã ĐÃ BUILD — không sửa được. Vite alias `next/link` sang file
 * này (xem `vite.config.js`). Nhận đúng những prop mà gói đó dùng và bỏ qua các
 * prop riêng của Next (`prefetch`, `scroll`...).
 *
 * Link ra ngoài (http://, mailto:) trả `<a>` thường — react-router chỉ hiểu
 * đường dẫn trong app.
 */
type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  children?: React.ReactNode;
};

const Link = React.forwardRef<HTMLAnchorElement, Props>(function Link(
  { href, prefetch: _prefetch, scroll: _scroll, replace, children, ...rest },
  ref,
) {
  if (/^[a-z]+:|^\/\//i.test(href)) {
    return (
      <a ref={ref} href={href} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink ref={ref} to={href} replace={replace} {...rest}>
      {children}
    </RouterLink>
  );
});

export default Link;
