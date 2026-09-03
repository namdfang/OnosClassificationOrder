import { useLocation, useNavigate, useSearchParams as useRouterSearchParams } from 'react-router-dom';

/**
 * Shim `next/navigation` cho app Vite — xem `link.tsx` để biết vì sao cần.
 *
 * Chỉ hiện thực đúng phần gói Zalo dùng: `useRouter().push/replace/back/refresh`,
 * `usePathname()`, `useSearchParams()`. `refresh()` của Next là nạp lại dữ liệu
 * phía server — app này không có, nên để rỗng thay vì reload cả trang (reload sẽ
 * đá người dùng ra khỏi cuộc trò chuyện đang mở).
 */
export function useRouter() {
  const navigate = useNavigate();

  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    prefetch: () => undefined,
    refresh: () => undefined,
  };
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const [params] = useRouterSearchParams();

  return params;
}
