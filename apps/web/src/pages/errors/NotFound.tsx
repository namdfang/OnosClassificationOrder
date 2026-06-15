import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PATHS } from '../../constants/paths';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <p className="text-7xl font-bold text-foreground tracking-tight">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you visited does not exist or has been moved.
        </p>
        <Button onClick={() => navigate(PATHS.HOME)} className="mt-6">
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
