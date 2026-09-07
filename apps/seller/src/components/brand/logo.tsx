'use client';

/* eslint-disable @next/next/no-img-element */

/** Mark ONOSPOD chính chủ (`public/onos-logo.svg` — tải từ app.onosfactory.com/branding/logo.svg). */
export function OnosMark({ className = '' }: { className?: string }) {
  return <img src="/onos-logo.svg" alt="Onos" className={`object-contain ${className}`} draggable={false} />;
}

export function OnosLogo({ title, subtitle, className = '' }: { title: string; subtitle: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <OnosMark className="w-8 h-8 shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="text-[12px] font-extrabold text-text-primary truncate font-display">{title}</div>
        <div className="text-[8px] font-semibold text-text-muted tracking-wider">{subtitle}</div>
      </div>
    </div>
  );
}
