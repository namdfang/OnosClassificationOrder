import { useEffect, useMemo, useState } from 'react';
import type { Customer, User } from 'shared';
import { Status } from 'shared';

import { RepositoryRemote } from '@/services';

import type { ImpersonationCandidate } from '@/utils/impersonationStart';

import { useDebounce } from '@/hooks/useDebounce';

/**
 * `users.status` trong DB lưu LẪN KIỂU (chuỗi `"1"`, chuỗi `"0"`, và cả số
 * nguyên `1`) — TESTER đo được trên dữ liệu thật. So sánh chặt với `Status.Active`
 * sẽ đánh nhầm nhiều tài khoản đang hoạt động thành "đã vô hiệu hoá", nên chuẩn
 * hoá về chuỗi trước khi so.
 */
const isInactive = (status: unknown): boolean => String(status ?? Status.Active) === String(Status.Inactive);

/**
 * Tìm tài khoản mạo danh được từ CẢ HAI nguồn — nhân viên (`GET /users`) và
 * khách hàng Customer Portal (`GET /customers`). Dùng chung cho trang
 * `/impersonate` (AUTH-1) và nút truy cập nhanh trên thanh nav (AUTH-2), nên hai
 * lối vào luôn tìm ra cùng một tập kết quả.
 *
 * KHÔNG có endpoint mới: cả hai đường đã sẵn tham số `search`.
 *
 * `users`/`customers` là `null` khi nguồn đó GỌI HỎNG (khác mảng rỗng = không có
 * kết quả) — nơi gọi hiện cảnh báo riêng cho từng nguồn.
 */
export function useImpersonationSearch(keyword: string) {
  const debounced = useDebounce(keyword, 400) as string;
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<ImpersonationCandidate[] | null>(null);
  const [customers, setCustomers] = useState<ImpersonationCandidate[] | null>(null);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setUsers(null);
      setCustomers(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Hai nguồn chạy SONG SONG và độc lập: một bên hỏng thì bên kia vẫn hiện
    // được, thay vì để trắng cả màn hình vì một nửa lỗi.
    void Promise.allSettled([
      RepositoryRemote.users.getUsers(`?page=1&limit=50&search=${encodeURIComponent(q)}`),
      RepositoryRemote.customer.list(q),
    ])
      .then(([u, c]) => {
        if (cancelled) return;
        setUsers(
          u.status === 'fulfilled'
            ? ((u.value?.data?.data || []) as User[])
                // `_id` là optional trong DTO dùng chung — bỏ bản ghi thiếu id
                // thay vì ép kiểu, vì không có id thì cũng không mạo danh được.
                .filter((x): x is User & { _id: string } => !!x._id)
                .map((x) => ({
                  targetType: 'user' as const,
                  id: x._id,
                  title: x.fullName || x.email,
                  subtitle: [x.email, (x as User & { role?: { name?: string } }).role?.name]
                    .filter(Boolean)
                    .join(' · '),
                  inactive: isInactive(x.status),
                }))
            : null,
        );
        setCustomers(
          c.status === 'fulfilled'
            ? ((c.value?.data?.data || []) as Customer[])
                .filter((x): x is Customer & { _id: string } => !!x._id)
                .map((x) => ({
                  targetType: 'customer' as const,
                  id: x._id,
                  title: x.fullName || x.userSku,
                  subtitle: [x.userEmail, x.tier != null ? `VIP ${x.tier}` : null].filter(Boolean).join(' · '),
                  inactive: isInactive(x.status),
                }))
            : null,
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const results = useMemo(() => [...(users || []), ...(customers || [])], [users, customers]);

  return { debounced, loading, users, customers, results };
}
