import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { ClipboardList, Factory, LineChart, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';

import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../constants/paths';

function buildFeatures(t: TFunction<'landing'>) {
  return [
    { icon: ClipboardList, title: t('features.orders.title'), description: t('features.orders.description') },
    { icon: Factory, title: t('features.production.title'), description: t('features.production.description') },
    { icon: LineChart, title: t('features.reports.title'), description: t('features.reports.description') },
    { icon: ShieldCheck, title: t('features.tracking.title'), description: t('features.tracking.description') },
  ];
}

function buildSteps(t: TFunction<'landing'>) {
  return [
    { step: '1', title: t('howItWorks.step1.title'), description: t('howItWorks.step1.description') },
    { step: '2', title: t('howItWorks.step2.title'), description: t('howItWorks.step2.description') },
    { step: '3', title: t('howItWorks.step3.title'), description: t('howItWorks.step3.description') },
  ];
}

function Landing() {
  const navigate = useNavigate();
  const { t } = useTranslation('landing');
  const FEATURES = buildFeatures(t);
  const STEPS = buildSteps(t);

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
              {t('nav.features')}
            </a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              {t('nav.howItWorks')}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(PATHS.CUSTOMER_LOGIN)}>
              {t('customer')}
            </Button>
            <Button onClick={() => navigate(PATHS.LOGIN)}>{t('signIn')}</Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground tracking-tight max-w-2xl mx-auto">
            {t('hero.title')}
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl mx-auto">{t('hero.subtitle')}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Button size="lg" className="w-full sm:w-auto h-11 px-8" onClick={() => navigate(PATHS.LOGIN)}>
              {t('hero.signInSystem')}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto h-11 px-8"
              onClick={() => navigate(PATHS.CUSTOMER_REGISTER)}
            >
              {t('hero.customerOrderNow')}
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
          <h2 className="text-xl font-bold text-foreground text-center">{t('howItWorks.title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10">
            {STEPS.map(({ step, title, description }) => (
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
          <span>{t('footer.tagline')}</span>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
