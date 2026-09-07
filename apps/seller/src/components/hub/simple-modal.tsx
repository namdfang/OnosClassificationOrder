'use client';

import { X } from 'lucide-react';

interface SimpleModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export function SimpleModal({ open, title, onClose, children, footer, width = 'max-w-md' }: SimpleModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'var(--color-overlay)' }} onClick={onClose}>
      <div className={`w-full ${width} bg-card rounded-xl border border-border1 shadow-elevated flex flex-col max-h-[85vh]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border1">
          <h2 className="text-sm font-bold text-text-primary">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-card-hover text-text-muted"><X size={15} /></button>
        </div>
        <div className="px-4 py-3 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-border1 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
