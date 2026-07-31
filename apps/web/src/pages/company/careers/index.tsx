import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DollarSign,
  FileText,
  Gift,
  Globe,
  HardHat,
  Mail,
  MapPin,
  UserCheck,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import applicationQrUrl from '@/assets/images/careers-application-qr.png';
import heroPhotoUrl from '@/assets/images/careers-hero.png';
import logoUrl from '@/assets/images/logo.png';

import { PATHS } from '../../../constants/paths';

type SectionIcon = React.ComponentType<{ size?: number | string; className?: string }>;

function buildInfoStrip(t: TFunction<'careers'>) {
  return [
    { icon: MapPin, label: t('infoStrip.location.label'), value: t('infoStrip.location.value') },
    { icon: DollarSign, label: t('infoStrip.pay.label'), value: t('infoStrip.pay.value') },
    { icon: Clock, label: t('infoStrip.shift.label'), value: t('infoStrip.shift.value') },
    { icon: HardHat, label: t('infoStrip.safety.label'), value: t('infoStrip.safety.value') },
  ];
}

function buildListSection(t: TFunction<'careers'>, key: 'responsibilities' | 'qualifications' | 'benefits') {
  return {
    title: t(`${key}.title`),
    items: t(`${key}.items`, { returnObjects: true }) as string[],
  };
}

function buildMailtoHref(email: string, subjectPrefix: string, role?: string) {
  const subject = role ? `${subjectPrefix} — ${role}` : subjectPrefix;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

function SectionHeaderBar({ icon: Icon, title }: { icon: SectionIcon; title: string }) {
  return (
    <div className="relative flex items-center gap-2 rounded-md bg-[#0d2a1f] px-4 py-2.5 pr-6 mb-4 text-white overflow-hidden">
      <Icon size={18} className="text-amber-400 shrink-0" />
      <h2 className="font-bold uppercase tracking-wide text-sm">{title}</h2>
      <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[18px] border-l-[14px] border-y-transparent border-l-amber-400" />
    </div>
  );
}

function ChecklistCard({
  id,
  icon,
  section,
}: {
  id?: string;
  icon: SectionIcon;
  section: { title: string; items: string[] };
}) {
  return (
    <div id={id} className="rounded-lg border border-border bg-card overflow-hidden">
      <SectionHeaderBar icon={icon} title={section.title} />
      <ul className="space-y-2.5 px-4 pb-5">
        {section.items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompanyCareers() {
  const { t } = useTranslation('careers');
  const INFO_STRIP = buildInfoStrip(t);
  const RESPONSIBILITIES = buildListSection(t, 'responsibilities');
  const QUALIFICATIONS = buildListSection(t, 'qualifications');
  const BENEFITS = buildListSection(t, 'benefits');
  const SCHEDULE_ITEMS = t('schedule.items', { returnObjects: true }) as string[];
  const EMPLOYMENT_TYPE_ITEMS = t('employmentType.items', { returnObjects: true }) as string[];

  const email = t('apply.email.value');
  const subjectPrefix = t('apply.subjectPrefix');
  const roleTitle = t('hero.roleTitle');
  const applicationFormLink = t('apply.applicationForm.link');
  const applyOnlineHref = `${PATHS.COMPANY_CAREERS}#apply`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-[#0d2a1f]">
        <div className="max-w-6xl mx-auto px-4 h-20 flex items-center justify-between gap-4">
          <Link to={PATHS.LANDING} className="flex items-center gap-3">
            <span className="flex items-center justify-center rounded-lg bg-white p-1.5 shadow-sm">
              <img src={logoUrl} alt="Onos Group" className="h-7 w-auto object-contain" />
            </span>
            <span className="hidden sm:flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-wide uppercase text-white">Onos Group</span>
              <span className="text-[10px] font-semibold tracking-widest text-amber-400">Careers</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
            <a href="#responsibilities" className="hover:text-white transition-colors">
              {t('nav.responsibilities')}
            </a>
            <a href="#qualifications" className="hover:text-white transition-colors">
              {t('nav.qualifications')}
            </a>
            <a href="#benefits" className="hover:text-white transition-colors">
              {t('nav.benefits')}
            </a>
            <a href="#apply" className="hover:text-white transition-colors">
              {t('nav.apply')}
            </a>
          </nav>

          <Button asChild size="sm" className="bg-amber-400 text-emerald-950 hover:bg-amber-300">
            <a href={applicationFormLink} target="_blank" rel="noopener noreferrer">
              {t('hero.ctaApply')}
            </a>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="text-center lg:text-left">
              <p className="text-amber-600 font-extrabold uppercase tracking-wide text-lg">{t('hero.badge')}</p>
              <h1 className="text-4xl md:text-6xl font-black text-foreground uppercase tracking-tight mt-1">
                {roleTitle}
              </h1>

              <div className="inline-flex items-center gap-2 mt-5 rounded-full bg-[#0d2a1f] px-5 py-2 text-sm font-bold text-amber-400">
                <Users size={16} />
                {t('hero.openPositions')}
              </div>

              <p className="text-foreground font-bold uppercase tracking-wide mt-6">{t('hero.tagline')}</p>

              <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 mt-8">
                <Button
                  asChild
                  size="lg"
                  className="w-full sm:w-auto h-11 px-8 bg-[#0d2a1f] text-white hover:bg-[#123726]"
                >
                  <a href={applicationFormLink} target="_blank" rel="noopener noreferrer">
                    {t('hero.ctaApply')}
                    <ArrowRight size={16} className="ml-1.5" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-11 px-8">
                  <a href="#apply">
                    <FileText size={16} className="mr-1.5" />
                    {t('hero.ctaApplyForm')}
                  </a>
                </Button>
              </div>
            </div>

            <img
              src={heroPhotoUrl}
              alt="Onos Group machine operator working on POD production equipment"
              className="w-full h-auto rounded-lg shadow-md object-cover"
            />
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 rounded-lg border border-border bg-card p-6">
            {INFO_STRIP.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="h-9 w-9 shrink-0 rounded-md bg-[#0d2a1f] flex items-center justify-center">
                  <Icon size={18} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChecklistCard id="responsibilities" icon={ClipboardCheck} section={RESPONSIBILITIES} />
            <ChecklistCard id="qualifications" icon={UserCheck} section={QUALIFICATIONS} />
            <ChecklistCard id="benefits" icon={Gift} section={BENEFITS} />
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <ChecklistCard icon={CalendarClock} section={{ title: t('schedule.title'), items: SCHEDULE_ITEMS }} />
            <ChecklistCard
              icon={Briefcase}
              section={{ title: t('employmentType.title'), items: EMPLOYMENT_TYPE_ITEMS }}
            />
          </div>
        </section>

        <section id="apply" className="max-w-6xl mx-auto px-4 py-16">
          <div className="rounded-lg overflow-hidden">
            <div className="text-center text-white px-6 py-10 bg-[#0d2a1f]">
              <h2 className="text-2xl font-extrabold uppercase text-amber-400">{t('apply.title')}</h2>
              <p className="text-sm text-white/80 mt-2 max-w-xl mx-auto">{t('apply.subtitle')}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mt-4">
                {t('apply.waysTitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 border border-t-0 border-border rounded-b-lg bg-card">
              <a
                href={buildMailtoHref(email, subjectPrefix, roleTitle)}
                className="rounded-lg border border-border p-4 text-center hover:bg-accent transition-colors"
              >
                <Mail size={20} className="mx-auto text-[#0d2a1f]" />
                <h3 className="text-sm font-semibold text-foreground mt-2">{t('apply.email.label')}</h3>
                <p className="text-xs text-muted-foreground mt-1">{t('apply.email.value')}</p>
              </a>

              <a
                href={applicationFormLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-border p-4 text-center hover:bg-accent transition-colors"
              >
                <FileText size={20} className="mx-auto text-[#0d2a1f]" />
                <h3 className="text-sm font-semibold text-foreground mt-2">{t('apply.applicationForm.label')}</h3>
                <img
                  src={applicationQrUrl}
                  alt={t('apply.applicationForm.label')}
                  className="mx-auto mt-3 h-24 w-24 object-contain"
                />
                <p className="text-xs text-muted-foreground mt-2">{t('apply.applicationForm.value')}</p>
              </a>

              <a
                href={applyOnlineHref}
                className="rounded-lg border border-border p-4 text-center hover:bg-accent transition-colors"
              >
                <Globe size={20} className="mx-auto text-[#0d2a1f]" />
                <h3 className="text-sm font-semibold text-foreground mt-2">{t('apply.online.label')}</h3>
                <p className="text-xs text-muted-foreground mt-1">{t('apply.online.value')}</p>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0d2a1f]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-white/80">
          <span>
            {t('footer.website')} · {t('footer.email')}
          </span>
          <span>{t('footer.eeo')}</span>
          <Link to={PATHS.LANDING} className="hover:text-white transition-colors">
            {t('footer.backToHome')}
          </Link>
        </div>
      </footer>
    </div>
  );
}

export default CompanyCareers;
