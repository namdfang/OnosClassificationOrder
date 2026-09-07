import type { Metadata, Viewport } from 'next';
import { Inter, Lexend_Deca } from 'next/font/google';
import { cookies } from 'next/headers';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { SWRProvider } from '@/components/providers/swr-provider';
import { ThemeScript } from '@/components/providers/theme-script';
import { ToastProvider } from '@/components/shared/toast';
import { DeviceProvider } from '@/context/device-context';
import { MobileSidebarProvider } from '@/context/mobile-sidebar-context';
import { SessionProvider } from '@/context/session-context';
import { ThemeProvider } from '@/context/theme-context';
import { LANG_COOKIE, normalizeLanguage } from '@/i18n/constants';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter', display: 'swap' });
const lexend = Lexend_Deca({ subsets: ['latin', 'vietnamese'], variable: '--font-lexend', display: 'swap', weight: ['500', '600', '700'] });

export const metadata: Metadata = {
  title: 'OnosFactory Seller Portal',
  description: 'Đặt đơn, theo dõi sản xuất và quản lý đơn hàng tại xưởng OnosFactory',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6f26c2',
  interactiveWidget: 'resizes-content',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const lang = normalizeLanguage(jar.get(LANG_COOKIE)?.value);
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${inter.variable} ${lexend.variable} antialiased`}>
        <I18nProvider initialLanguage={lang}>
          <SWRProvider>
            <ThemeProvider>
              <DeviceProvider>
                <MobileSidebarProvider>
                  <ToastProvider>
                    <SessionProvider>{children}</SessionProvider>
                  </ToastProvider>
                </MobileSidebarProvider>
              </DeviceProvider>
            </ThemeProvider>
          </SWRProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
