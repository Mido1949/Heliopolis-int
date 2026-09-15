'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  ClipboardList,
  Gauge,
  Loader2,
  PieChart,
  RefreshCw,
  Target,
  Trophy,
  UserPlus,
  Wallet,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useLanguage } from '@/context/LanguageContext';
import { useCommandCenterData } from './useCommandCenterData';
import { useRegisterRailSections, type RailSection } from '@/context/RailContext';
import ModuleCard from './ModuleCard';
import StatusRing from '@/components/layout/StatusRing';
import MetricTable from './cards/MetricTable';
import FunnelCard from './cards/FunnelCard';
import TeamMapCard from './cards/TeamMapCard';
import TopPerformersCard from './cards/TopPerformersCard';
import DecisionMemoCard from './cards/DecisionMemoCard';
import SignalList from './cards/SignalList';
import OperationsCard from './cards/OperationsCard';
import WelcomeHero from '@/components/dashboard/WelcomeHero';
import StatCard from '@/components/dashboard/StatCard';
import DailyActivityCard from './cards/DailyActivityCard';
import RecentLeadsCard from './cards/RecentLeadsCard';

// recharts is heavy and only the trends card needs it — keep it out of the
// initial bundle.
const DashboardCharts = dynamic(() => import('../../dashboard/DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
    </div>
  ),
});

/**
 * Command Center — the hub page of the hub-and-spoke layout.
 *
 * Left rail filters the bento grid by section; every card is a condensed read
 * of one module with a "View full →" link to that module's own page (the spoke).
 * All figures come from live Supabase data under the caller's RLS.
 */
export default function CommandCenterClient() {
  const { lang, dir } = useLanguage();
  const rtl = dir === 'rtl';
  const router = useRouter();
  const { user, profile, loading: authLoading, isAdmin, isManager, isTeamLeader, isStaff } =
    useAuth();
  const { org, currentOrgId, isLoading: orgLoading, loadError: orgLoadError, retry: retryOrg } = useOrg();
  const canSeeTeam = isAdmin || isManager || isTeamLeader;

  const [section, setSection] = useState('overview');

  const { data, loading, error, reload } = useCommandCenterData({
    orgId: currentOrgId,
    orgName: org?.name ?? 'HelioMax',
    canSeeTeam,
    userId: user?.id ?? null,
  });

  // This page is now the post-login landing page and `/` redirects here, so
  // reps get bounced to their focused My Day exactly as /dashboard used to do.
  // Require a resolved `profile`: a transient profile-fetch failure reads
  // isStaff as false and would bounce an admin.
  useEffect(() => {
    if (!authLoading && user && profile && !isStaff) {
      router.replace('/my-leads');
    }
  }, [authLoading, user, profile, isStaff, router]);

  const sections: RailSection[] = useMemo(
    () => [
      { id: 'overview', label: 'Overview', labelAr: 'نظرة عامة', icon: <Gauge className="h-4 w-4" /> },
      { id: 'pipeline', label: 'Pipeline', labelAr: 'خط الأنابيب', icon: <BarChart2 className="h-4 w-4" /> },
      { id: 'economics', label: 'Sales Economics', labelAr: 'اقتصاديات البيع', icon: <PieChart className="h-4 w-4" /> },
      { id: 'team', label: 'Team', labelAr: 'الفريق', icon: <Users className="h-4 w-4" /> },
      { id: 'decisions', label: 'Decisions', labelAr: 'القرارات', icon: <ClipboardList className="h-4 w-4" /> },
      { id: 'operations', label: 'Operations', labelAr: 'العمليات', icon: <Activity className="h-4 w-4" /> },
    ],
    [],
  );

  const targetCaption = data
    ? data.target.target !== null
      ? lang === 'ar'
        ? `${data.target.actual} / ${data.target.target} عميل هذا الشهر`
        : `${data.target.actual} / ${data.target.target} leads this month`
      : lang === 'ar'
        ? 'لم يتم تحديد هدف شهري'
        : 'No monthly target set'
    : '';

  // Publish this page's sections into the shared app rail. Must run before the
  // early returns below — it's a hook.
  useRegisterRailSections({
    sections,
    activeId: section,
    onSelect: setSection,
    ring: data ? { progress: data.target.progress, caption: targetCaption } : null,
    groupLabel: 'Command Center',
    groupLabelAr: 'مركز القيادة',
  });

  const shows = (id: string) => section === 'overview' || section === id;

  // The hero strip reuses the pipeline table's already-computed rows.
  const heroRow = (label: string) => data?.pipelineRows.find(r => r.label === label);

  if (orgLoading || (loading && !data)) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-10 w-10 animate-spin text-[#D72B2B]" />
          <p className="text-sm font-medium text-slate-500">
            {lang === 'ar' ? 'جاري تحميل مركز القيادة...' : 'Loading command center...'}
          </p>
        </div>
      </div>
    );
  }

  if (!currentOrgId || (error && !data)) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="max-w-md text-center text-sm">
            {error || orgLoadError || 'تعذر تحميل بيانات الشركة — Couldn’t load organization data.'}
          </p>
          <button
            onClick={() => (currentOrgId ? reload() : retryOrg())}
            className="rounded-lg bg-[#0D2137] px-4 py-2 text-sm text-white hover:opacity-90"
          >
            إعادة المحاولة — Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5 pb-8">
      <WelcomeHero
        name={profile?.name || ''}
        lang={lang}
        subtitle={
          lang === 'ar'
            ? `ده اللي بيحصل في ${data.orgName} النهاردة`
            : `Here's what's happening at ${data.orgName} today`
        }
        actions={
          <button
            onClick={() => reload()}
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {lang === 'ar' ? 'تحديث' : 'Refresh'}
          </button>
        }
      />

      {/* Welcome strip — the four numbers worth knowing before anything else. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="violet"
          icon={<UserPlus className="h-5 w-5" />}
          label={lang === 'ar' ? 'عملاء جدد الشهر ده' : 'New leads this month'}
          value={heroRow('New leads')?.value ?? '—'}
          deltaPercent={heroRow('New leads')?.delta}
          deltaCaption={lang === 'ar' ? 'عن الشهر اللي فات' : 'vs last month'}
          trend={data.leadsTrend}
        />
        <StatCard
          tone="green"
          icon={<Trophy className="h-5 w-5" />}
          label={lang === 'ar' ? 'صفقات مكتملة' : 'Deals won'}
          value={heroRow('Deals won')?.value ?? '—'}
          deltaPercent={heroRow('Deals won')?.delta}
          deltaCaption={lang === 'ar' ? 'عن الشهر اللي فات' : 'vs last month'}
          trend={data.leadsTrend}
        />
        <StatCard
          tone="blue"
          icon={<Wallet className="h-5 w-5" />}
          label={lang === 'ar' ? 'خط الأنابيب النشط' : 'Active pipeline'}
          value={heroRow('Active pipeline')?.value ?? '—'}
          trend={data.leadsTrend}
        />
        <StatCard
          tone="amber"
          icon={<Target className="h-5 w-5" />}
          label={lang === 'ar' ? 'هدف الشهر' : 'Monthly target'}
          value={data.target.target !== null ? `${data.target.progress}%` : '—'}
          progress={data.target.target !== null ? data.target.progress : 0}
          progressCaption={targetCaption}
        />
      </div>

      <div className="flex flex-col gap-5">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Mobile/tablet ring — the rail hides it below lg */}
          <div className="col-span-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:hidden">
            <StatusRing
              progress={data.target.progress}
              label={lang === 'ar' ? 'من الهدف' : 'of target'}
              caption={targetCaption}
            />
          </div>

          {shows('pipeline') && (
            <ModuleCard
              title="Executive Summary"
              titleAr="الملخص التنفيذي"
              icon={<Zap className="h-4 w-4" />}
              badge={lang === 'ar' ? 'مباشر' : 'Live'}
              href="/reports"
              linkLabel={lang === 'ar' ? 'عرض التقارير' : 'View reports'}
              span="third"
              rtl={rtl}
            >
              <ul className="space-y-2">
                {data.summary.map(line => (
                  <li key={line} className="text-[11px] leading-relaxed text-slate-600">
                    {line}
                  </li>
                ))}
              </ul>
            </ModuleCard>
          )}

          {shows('pipeline') && (
            <ModuleCard
              title="Pipeline Summary"
              titleAr="ملخص خط الأنابيب"
              icon={<BarChart2 className="h-4 w-4" />}
              badge={lang === 'ar' ? 'هذا الشهر' : 'This month'}
              href="/crm"
              linkLabel={lang === 'ar' ? 'فتح CRM' : 'Open CRM'}
              span="third"
              rtl={rtl}
            >
              <MetricTable rows={data.pipelineRows} lang={lang} />
            </ModuleCard>
          )}

          {shows('economics') && (
            <ModuleCard
              title="Sales Economics"
              titleAr="اقتصاديات البيع"
              icon={<PieChart className="h-4 w-4" />}
              href="/boq"
              linkLabel={lang === 'ar' ? 'فتح عروض الأسعار' : 'Open BOQ'}
              span="third"
              rtl={rtl}
            >
              <MetricTable rows={data.economicsRows} lang={lang} />
            </ModuleCard>
          )}

          {shows('pipeline') && (
            <ModuleCard
              title="Pipeline Sizing"
              titleAr="حجم خط الأنابيب"
              icon={<Target className="h-4 w-4" />}
              href="/analytics"
              linkLabel={lang === 'ar' ? 'عرض التحليلات' : 'View analytics'}
              span="third"
              rtl={rtl}
            >
              <FunnelCard funnel={data.funnel} lang={lang} />
            </ModuleCard>
          )}

          {shows('team') && (
            <ModuleCard
              title="Team Map"
              titleAr="خريطة الفريق"
              icon={<Users className="h-4 w-4" />}
              badge={lang === 'ar' ? 'اليوم' : 'Today'}
              href="/reports"
              linkLabel={lang === 'ar' ? 'مقارنة كاملة' : 'Full comparison'}
              span="third"
              rtl={rtl}
            >
              <TeamMapCard team={data.team} lang={lang} />
            </ModuleCard>
          )}

          {shows('team') && (
            <ModuleCard
              title="Top Performers"
              titleAr="الأعلى أداءً"
              icon={<Trophy className="h-4 w-4" />}
              href="/reports"
              linkLabel={lang === 'ar' ? 'عرض الأهداف' : 'View targets'}
              span="third"
              rtl={rtl}
            >
              <TopPerformersCard performers={data.performers} lang={lang} />
            </ModuleCard>
          )}

          {shows('decisions') && (
            <ModuleCard
              title="Decision Memo"
              titleAr="مذكرة القرار"
              icon={<ClipboardList className="h-4 w-4" />}
              span="third"
              rtl={rtl}
            >
              <DecisionMemoCard memo={data.memo} lang={lang} rtl={rtl} />
            </ModuleCard>
          )}

          {shows('decisions') && (
            <ModuleCard
              title="Key Drivers"
              titleAr="المحركات الرئيسية"
              icon={<Activity className="h-4 w-4" />}
              span="third"
              rtl={rtl}
            >
              <SignalList
                items={data.signals}
                emptyLabel={lang === 'ar' ? 'لا توجد مؤشرات بعد' : 'No drivers yet'}
              />
            </ModuleCard>
          )}

          {shows('decisions') && (
            <ModuleCard
              title="Risks & Mitigations"
              titleAr="المخاطر والمعالجات"
              icon={<AlertTriangle className="h-4 w-4" />}
              span="third"
              rtl={rtl}
            >
              <SignalList
                items={data.risks}
                emptyLabel={lang === 'ar' ? 'لا توجد مخاطر مفتوحة' : 'No open risks'}
              />
            </ModuleCard>
          )}

          {shows('operations') && (
            <ModuleCard
              title="Operations"
              titleAr="العمليات"
              icon={<Activity className="h-4 w-4" />}
              span="full"
              rtl={rtl}
            >
              <OperationsCard ops={data.ops} lang={lang} />
            </ModuleCard>
          )}

          {shows('pipeline') && (
            <ModuleCard
              title="Recent Leads"
              titleAr="آخر العملاء"
              icon={<UserPlus className="h-4 w-4" />}
              href="/crm"
              linkLabel={lang === 'ar' ? 'كل العملاء' : 'All leads'}
              span="third"
              rtl={rtl}
            >
              <RecentLeadsCard leads={data.recentLeads} lang={lang} />
            </ModuleCard>
          )}

          {shows('team') && (
            <ModuleCard
              title="Daily Activity"
              titleAr="النشاط اليومي"
              icon={<ClipboardList className="h-4 w-4" />}
              badge={new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })}
              href="/reports"
              linkLabel={lang === 'ar' ? 'التقارير والأهداف' : 'Reports & targets'}
              span="twoThirds"
              rtl={rtl}
            >
              <DailyActivityCard rows={data.dailyReport} lang={lang} />
            </ModuleCard>
          )}

          {shows('economics') && (
            <ModuleCard
              title="Trends & Breakdown"
              titleAr="الاتجاهات والتوزيع"
              icon={<PieChart className="h-4 w-4" />}
              span="full"
              rtl={rtl}
            >
              <DashboardCharts />
            </ModuleCard>
          )}
        </div>
      </div>
    </div>
  );
}
