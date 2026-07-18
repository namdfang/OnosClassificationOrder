import React from 'react';

import { cn } from '@/utils/cn';

export interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 24, className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent text-foreground',
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
