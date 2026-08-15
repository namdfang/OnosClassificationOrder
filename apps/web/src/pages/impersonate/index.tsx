import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { AlertTriangle, Search, UserCog } from 'lucide-react';
import type { Customer, StartImpersonationDto, User } from 'shared';
import { RoleType, Status } from 'shared';

import { PATHS } from '@/constants/paths';

import { useAuthStore } from '@/store/authStore';
import { useCustomerAuthStore } from '@/store/customerAuthStore';
import { AUTH_REMEMBER_KEY } from '@/store/sessionPersist';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';

/** 1 dòng kết quả — gộp chung 2 nguồn tài khoản về một hình dạng để render. */
interface Candidate {
  targetType: 'user' | 'customer';
  id: string;
  /** Dòng đầu — tên hiển thị. */
  title: string;
  /** Dòng phụ — email / SKU / role. */
  subtitle: string;
  inactive: boolean;
}

/**
 * `users.status` trong DB lưu LẪN KIỂU (chuỗi `"1"`, chuỗi `"0"`, và cả số
 * nguyên `1`) — TESTER đo được trên dữ liệu thật. So sánh chặt với `Status.Active`
 * sẽ đánh nhầm nhiều tài khoản đang hoạt động thành "đã vô hiệu hoá", nên chuẩn
 * hoá về chuỗi trước khi so.
 */
const isInactive = (status: unknown): boolean => String(status ?? Status.Active) === String(Status.Inactive);

/**
 * Màn hình **Mạo danh tài khoản** — CHỈ SuperAdmin (AUTH-1 `BR-1`).
 *
 * Gộp CẢ HAI nguồn tài khoản vào một ô tìm kiếm: nhân viên (`GET /users`) và
 * khách hàng Customer Portal (`GET /customers`). Trước đây tài khoản khách chỉ
 * tới được qua một dialog nằm trong trang cấu hình gán xưởng — không ai đoán ra,
 * và mâu thuẫn trực tiếp với chữ "nhanh" trong chính yêu cầu gốc.
 *
 * KHÔNG cần endpoint mới: cả hai endpoint đã có sẵn tham số `search`.
 */
function ImpersonatePage() {
  const { t } = useTranslation('auth');
  const { roleName } = usePermission();
  const impersonatedBy = useAuthStore((s) => s.profile?.impersonatedBy);

  const [keyword, setKeyword] = useState('');
  const debounced = useDebounce(keyword, 400);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Candidate[] | null>(null);
  const [customers, setCustomers] = useState<Candidate[] | null>(null);
  const [target, setTarget] = useState<Candidate | null>(null);
  const [starting, setStarting] = useState(false);

  const isSuperAdmin = roleName === RoleType.SuperAdmin;

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
                subtitle: [x.email, (x as User & { role?: { name?: string } }).role?.name].filter(Boolean).join(' · '),
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

  const doStart = async () => {
    if (!target) return;
    try {
      setStarting(true);
      const payload: StartImpersonationDto = { targetType: target.targetType, targetId: target.id };
      const res = await RepositoryRemote.impersonate.start(payload);
      const data = res.data?.data as
        | { accessToken: string; expiresIn: number; impersonating?: { targetType: 'user' | 'customer' } }
        | undefined;
      if (!data?.accessToken) throw new Error('missing token');

      // Điều hướng theo `targetType` do BE trả, KHÔNG tự đoán từ id (`BR-5`).
      const kind = data.impersonating?.targetType ?? target.targetType;
      const expiredAt = Date.now() + (data.expiresIn ?? 0) * 1000;

      if (kind === 'customer') {
        // Mạo danh KHÁCH ghi vào store riêng — phiên nhân viên thật của
        // SuperAdmin trong `authStore` GIỮ NGUYÊN (`BR-14`).
        const store = useCustomerAuthStore.getState();
        store.setToken(data.accessToken);
        store.setTokenExpiredAt(expiredAt);
        window.location.href = PATHS.CUSTOMER_ORDERS;
        return;
      }

      const store = useAuthStore.getState();
      // Giữ nguyên marker "ghi nhớ đăng nhập" — mặc định `false` của `setToken`
      // sẽ âm thầm chuyển blob phiên sang sessionStorage.
      store.setToken(data.accessToken, localStorage.getItem(AUTH_REMEMBER_KEY) === '1');
      store.setTokenExpiredAt(expiredAt);
      window.location.href = PATHS.ORDERS_WORKSHOP;
    } catch (err) {
      handleAxiosError(err);
      setStarting(false);
    }
  };

  // Đang mạo danh thì không mở phiên mạo danh nữa (`BR-6`/`AC-08`). Thực tế
  // profile lúc đó là của người bị mạo danh nên `isSuperAdmin` đã false; nhánh
  // này chỉ để thông báo rõ thay vì im lặng chuyển hướng.
  if (impersonatedBy) return <Navigate to={PATHS.HOME} replace />;
  if (!isSuperAdmin) return <Navigate to={PATHS.HOME} replace />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <UserCog size={18} /> {t('impersonate.title')}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('impersonate.subtitle')}</p>

      <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <p>{t('impersonate.warning')}</p>
      </div>

      <div className="relative mt-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('impersonate.searchPlaceholder')}
          className="pl-9"
          autoFocus
        />
      </div>

      <div className="mt-4">
        {!debounced.trim() ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('impersonate.searchHint')}</p>
        ) : loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={22} />
          </div>
        ) : (
          <>
            {users === null && <p className="mb-2 text-xs text-destructive">{t('impersonate.usersFailed')}</p>}
            {customers === null && <p className="mb-2 text-xs text-destructive">{t('impersonate.customersFailed')}</p>}
            {results.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t('impersonate.empty', { keyword: debounced.trim() })}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {results.map((c) => (
                  <li
                    key={`${c.targetType}-${c.id}`}
                    className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {c.targetType === 'user' ? t('impersonate.badgeStaff') : t('impersonate.badgeCustomer')}
                        </Badge>
                        <span className="truncate text-sm font-medium">{c.title}</span>
                        {/* Tài khoản đã vô hiệu hoá VẪN mạo danh được (`BR-2`/`AC-03`)
                            — badge chỉ để người dùng biết mình đang vào cái gì. */}
                        {c.inactive && (
                          <Badge variant="destructive" className="text-[10px]">
                            {t('impersonate.badgeInactive')}
                          </Badge>
                        )}
                      </div>
                      {c.subtitle && <p className="truncate text-xs text-muted-foreground">{c.subtitle}</p>}
                    </div>
                    <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setTarget(c)}>
                      {t('impersonate.action')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && !starting && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('impersonate.confirmTitle', { name: target?.title ?? '' })}</DialogTitle>
            <DialogDescription>{t('impersonate.confirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={starting} onClick={() => setTarget(null)}>
              {t('actions.cancel', { ns: 'common' })}
            </Button>
            <Button disabled={starting} onClick={() => void doStart()}>
              {t('impersonate.action')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ImpersonatePage;
