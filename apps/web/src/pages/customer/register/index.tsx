import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
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

const registerSchema = z.object({
  userEmail: z.string().min(1, 'Email là bắt buộc').email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  fullName: z.string().optional(),
  phone: z.string().optional(),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

function CustomerRegister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { userEmail: '', password: '', fullName: '', phone: '' },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      setLoading(true);
      await RepositoryRemote.customerAuth.register(values);
      toast.success('Đăng ký thành công, vui lòng đăng nhập');
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
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Đăng ký Customer Portal</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Tạo tài khoản để đặt đơn và theo dõi tiến trình</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-7 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="userEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="you@example.com" className="pl-9 h-10" {...field} />
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
                    <FormLabel>Mật khẩu</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input type="password" placeholder="Tối thiểu 6 ký tự" className="pl-9 h-10" {...field} />
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
                    <FormLabel>Họ tên (không bắt buộc)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Nguyễn Văn A" className="pl-9 h-10" {...field} />
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
                    <FormLabel>Số điện thoại (không bắt buộc)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="09xx xxx xxx" className="pl-9 h-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={loading} className="w-full h-10">
                {loading && <Spinner size={14} className="text-primary-foreground" />}
                Đăng ký
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Đã có tài khoản?{' '}
          <Link to={PATHS.CUSTOMER_LOGIN} className="text-primary hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}

export default CustomerRegister;
