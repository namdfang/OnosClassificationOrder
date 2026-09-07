"use client";

import { PackageOpen } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 text-text-placeholder">
        {icon || <PackageOpen size={48} strokeWidth={1.2} />}
      </div>
      <div className="text-[13px] font-bold text-text-secondary mb-1">{title}</div>
      {description && <div className="text-[11px] text-text-muted mb-4 max-w-[280px]">{description}</div>}
      {action}
    </div>
  );
}
