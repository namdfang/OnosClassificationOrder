import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center">
        <p className="font-display text-6xl font-extrabold text-accent">404</p>
        <p className="mt-2 text-sm text-text-secondary">Page not found · Không tìm thấy trang</p>
        <Link href="/portal/orders" prefetch={false} className="inline-block mt-4 px-4 py-2 rounded-lg bg-cta text-cta-foreground text-sm font-semibold no-underline">
          Seller Portal
        </Link>
      </div>
    </div>
  );
}
