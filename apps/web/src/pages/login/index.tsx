import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Spinner } from '@/components/common/Spinner';
import logoUrl from '@/assets/images/logo.png';
import { PATHS } from '../../constants/paths';
import { RepositoryRemote } from '../../services';
import { useAuthStore } from '../../store/authStore';
import { handleAxiosError } from '../../utils';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { setProfile, setToken, setTokenExpiredAt } = useAuthStore();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      setLoading(true);
      const resp = await RepositoryRemote.auth.login({ ...values, recaptchaToken: '' });
      const loginInfo = resp?.data;
      const expirationTime = new Date(new Date().getTime() + 24 * 60 * 60 * 1000).getTime();

      if (loginInfo) {
        setToken(loginInfo.accessToken);
        setTokenExpiredAt(expirationTime);
        setProfile(loginInfo.user);

        // Pull fresh profile (with role.permissionCodes populated) — login
        // response itself doesn't always include permission data.
        try {
          const meRes = await RepositoryRemote.auth.getMe();
          if (meRes?.data?.data) {
            setProfile(meRes.data.data);
          }
        } catch {
          /* fall back to login payload */
        }

        // Sub-designer login → vào thẳng /my-tasks (Kanban Phase 4). Các role
        // khác dùng dashboard chung.
        const roleName = (loginInfo.user as { role?: { name?: string } })?.role?.name;
        navigate(roleName === 'Designer' ? PATHS.MY_TASKS : PATHS.HOME);
        toast.success('Welcome back');
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
          <img src={logoUrl} alt="Logo" className="h-10 w-auto object-contain mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Sign in to your workspace</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Enter your credentials to continue</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-7 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
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
                    <FormLabel>Password</FormLabel>
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
                Continue
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Protected workspace — authorized access only
        </p>
      </div>
    </div>
  );
}

export default Login;
