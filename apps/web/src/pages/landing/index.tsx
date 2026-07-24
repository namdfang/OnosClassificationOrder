import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Factory, LineChart, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';

import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../constants/paths';

const FEATURES = [
  {
    icon: ClipboardList,
    title: 'Quản lý đơn hàng',
    description: 'Theo dõi toàn bộ đơn hàng từ import, phân loại đến xử lý lỗi trên một màn hình duy nhất.',
  },
  {
    icon: Factory,
    title: 'Điều phối sản xuất',
    description: 'Gán xưởng, phân công thiết kế và theo dõi từng công đoạn fulfillment theo thời gian thực.',
  },
  {
    icon: LineChart,
    title: 'Báo cáo & thống kê',
    description: 'Dashboard trực quan cho năng suất, tỉ lệ lỗi và tiến độ theo từng xưởng, từng người.',
  },
  {
    icon: ShieldCheck,
    title: 'Theo dõi tiến trình',
    description: 'Khách hàng tự đặt đơn và tra cứu tiến trình xử lý mọi lúc, không cần liên hệ trực tiếp.',
  },
];

function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
            <span className="font-bold text-foreground tracking-tight">Printsel</span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              Tính năng
            </a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              Quy trình
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(PATHS.CUSTOMER_LOGIN)}>
              Khách hàng
            </Button>
            <Button onClick={() => navigate(PATHS.LOGIN)}>Đăng nhập</Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground tracking-tight max-w-2xl mx-auto">
            Hệ thống quản lý sản xuất &amp; đơn hàng in ấn theo yêu cầu
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
            Quản lý đơn hàng, điều phối xưởng sản xuất và theo dõi tiến trình trên một nền tảng duy nhất.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Button size="lg" className="w-full sm:w-auto h-11 px-8" onClick={() => navigate(PATHS.LOGIN)}>
              Đăng nhập hệ thống
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto h-11 px-8"
              onClick={() => navigate(PATHS.CUSTOMER_REGISTER)}
            >
              Khách hàng — Đặt đơn ngay
            </Button>
          </div>
        </section>

        <section id="features" className="max-w-6xl mx-auto px-4 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-lg border border-border p-5 bg-card">
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                  <Icon size={20} className="text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground mt-1.5">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-xl font-bold text-foreground text-center">Quy trình đơn giản</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10">
            {[
              { step: '1', title: 'Đặt đơn', description: 'Khách hàng tạo tài khoản và đặt đơn trực tuyến.' },
              { step: '2', title: 'Sản xuất', description: 'Đơn được phân xưởng, thiết kế và sản xuất theo quy trình.' },
              { step: '3', title: 'Theo dõi', description: 'Tra cứu tiến trình xử lý đơn hàng theo thời gian thực.' },
            ].map(({ step, title, description }) => (
              <div key={step} className="text-center">
                <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold mx-auto">
                  {step}
                </div>
                <h3 className="font-semibold text-foreground mt-3">{title}</h3>
                <p className="text-sm text-muted-foreground mt-1.5">{description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Printsel</span>
          <span>Hệ thống quản lý sản xuất &amp; đơn hàng in ấn theo yêu cầu</span>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
