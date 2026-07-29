import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../../constants/paths';
import { RepositoryRemote } from '../../../services';
import { useCustomerAuthStore } from '../../../store/customerAuthStore';
import { handleAxiosError } from '../../../utils';

function buildLoginSchema(t: TFunction<'customerPortal'>) {
  return z.object({
    userEmail: z.string().min(1, t('login.validation.emailRequired')).email(t('login.validation.emailInvalid')),
    password: z.string().min(1, t('login.validation.passwordRequired')),
    rememberMe: z.boolean().default(false),
  });
}

type LoginFormValues = z.infer<ReturnType<typeof buildLoginSchema>>;

function CustomerLogin() {
  const navigate = useNavigate();
  const { t } = useTranslation('customerPortal');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { setProfile, setToken, setTokenExpiredAt, isAuthenticated } = useCustomerAuthStore();

  // Khách đã đăng nhập (token còn hạn) mà vào lại trang login → tự chuyển
  // hướng sang trang đơn hàng, khỏi phải đăng nhập lại.
  useEffect(() => {
    if (isAuthenticated()) navigate(PATHS.CUSTOMER_ORDERS, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginSchema = useMemo(() => buildLoginSchema(t), [t]);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { userEmail: '', password: '', rememberMe: false },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      setLoading(true);
      const resp = await RepositoryRemote.customerAuth.login(values);
      const loginInfo = resp?.data;

      if (loginInfo) {
        const expirationTime = Date.now() + (loginInfo.expiresIn ?? 24 * 60 * 60) * 1000;
        setToken(loginInfo.accessToken, values.rememberMe);
        setTokenExpiredAt(expirationTime);
        setProfile(loginInfo.user);
        navigate(PATHS.CUSTOMER_ORDERS);
        toast.success(t('login.success'));
      }
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-8">
          <Link to={PATHS.LANDING} className="inline-block">
            <img src={logoUrl} alt="Logo" className="h-10 w-auto object-contain mx-auto mb-5" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('login.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1.5">{t('login.subtitle')}</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-7 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="userEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.email')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder={t('login.emailPlaceholder')} className="pl-9 h-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.password')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder={t('login.passwordPlaceholder')}
                          className="pl-9 pr-10 h-10"
                          {...field}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rememberMe"
                render={({ field }) => (
                  <FormItem>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      {t('login.rememberMe')}
                    </label>
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={loading} className="w-full h-10">
                {loading && <Spinner size={14} className="text-primary-foreground" />}
                {t('login.submit')}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t('login.noAccount')}{' '}
          <Link to={PATHS.CUSTOMER_REGISTER} className="text-primary hover:underline">
            {t('login.registerNow')}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default CustomerLogin;
