import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { Lock, Mail, Phone, User } from 'lucide-react';
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
import { handleAxiosError } from '../../../utils';

function buildRegisterSchema(t: TFunction<'customerPortal'>) {
  return z.object({
    userEmail: z.string().min(1, t('register.validation.emailRequired')).email(t('register.validation.emailInvalid')),
    password: z.string().min(6, t('register.validation.passwordMin')),
    fullName: z.string().optional(),
    phone: z.string().optional(),
  });
}

type RegisterFormValues = z.infer<ReturnType<typeof buildRegisterSchema>>;

function CustomerRegister() {
  const navigate = useNavigate();
  const { t } = useTranslation('customerPortal');
  const [loading, setLoading] = useState(false);

  const registerSchema = useMemo(() => buildRegisterSchema(t), [t]);
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { userEmail: '', password: '', fullName: '', phone: '' },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      setLoading(true);
      await RepositoryRemote.customerAuth.register(values);
      toast.success(t('register.success'));
      navigate(PATHS.CUSTOMER_LOGIN);
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
          <img src={logoUrl} alt="Logo" className="h-10 w-auto object-contain mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('register.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1.5">{t('register.subtitle')}</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-7 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="userEmail"
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
                        <Input
                          type="password"
                          placeholder={t('register.passwordPlaceholder')}
                          className="pl-9 h-10"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('register.phone')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder={t('register.phonePlaceholder')} className="pl-9 h-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={loading} className="w-full h-10">
                {loading && <Spinner size={14} className="text-primary-foreground" />}
                {t('register.submit')}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t('register.haveAccount')}{' '}
          <Link to={PATHS.CUSTOMER_LOGIN} className="text-primary hover:underline">
            {t('register.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default CustomerRegister;
