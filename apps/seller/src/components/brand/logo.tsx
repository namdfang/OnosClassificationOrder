'use client';

/** Mark chữ "O" tím thương hiệu + tên cổng — chưa có file logo trong app, dùng mark chữ. */
export function OnosMark({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl text-white font-display font-extrabold ${className}`}
      style={{ background: 'linear-gradient(135deg, #6f26c2 0%, #6366f1 100%)' }}
      aria-hidden
    >
      O
    </div>
  );
}

export function OnosLogo({ title, subtitle, className = '' }: { title: string; subtitle: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <OnosMark className="w-7 h-7 text-[13px] shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="text-[12px] font-extrabold text-text-primary truncate font-display">{title}</div>
        <div className="text-[8px] font-semibold text-text-muted tracking-wider">{subtitle}</div>
      </div>
    </div>
  );
}
