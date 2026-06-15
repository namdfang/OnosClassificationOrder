import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PATHS } from '../../constants/paths';

export default function ForgotPassword() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mb-4">
            <KeyRound size={22} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Forgot password</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Password recovery is not enabled yet</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-7 shadow-sm text-center">
          <p className="text-sm text-muted-foreground">Contact your administrator to reset your password.</p>
          <Button asChild className="mt-5">
            <Link to={PATHS.LOGIN}>
              <ArrowLeft size={14} className="mr-1" />
              Back to sign in
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
