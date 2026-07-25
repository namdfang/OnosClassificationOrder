import React, { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { Lock, Mail, User } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../constants/paths';
import { RepositoryRemote } from '../../services';
import { useAuthStore } from '../../store/authStore';
import { handleAxiosError } from '../../utils';

function buildRegisterSchema(t: TFunction<'auth'>) {
  return z.object({
    fullName: z.string().min(1, t('register.validation.nameRequired')),
    email: z.string().min(1, t('register.validation.emailRequired')).email(t('register.validation.emailInvalid')),
    password: z.string().min(6, t('register.validation.passwordMin')),
  });
}

type RegisterFormValues = z.infer<ReturnType<typeof buildRegisterSchema>>;

function Register() {
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
  const { loading, setLoading } = useAuthStore();
  const [searchParam] = useSearchParams();
  const refCode = searchParam.get('ref') || '';

  const registerSchema = useMemo(() => buildRegisterSchema(t), [t]);
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setLoading(true);
    try {
      await RepositoryRemote.auth.register({
        ...values,
        passwordConfirm: values.password,
        recaptchaToken: '',
        refCode,
      });
      navigate(PATHS.LOGIN);
      toast.success(t('register.success'));
    } catch (error) {
      handleAxiosError(error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="Logo" className="h-10 w-auto object-contain mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('register.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1.5">{t('register.subtitle')}</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-7 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('register.fullName')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder={t('register.fullNamePlaceholder')} className="pl-9 h-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('register.email')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder={t('register.emailPlaceholder')} className="pl-9 h-10" {...field} />
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
                    <FormLabel>{t('register.password')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input type="password" placeholder="••••••••" className="pl-9 h-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={loading} className="w-full h-10">
                {loading && <Spinner size={14} className="text-primary-foreground" />}
                {t('register.createAccount')}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t('register.alreadyHaveAccount')}{' '}
          <Link to={PATHS.LOGIN} className="text-foreground hover:underline font-medium">
            {t('register.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
