'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Phone,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import WelcomeHero from '@/components/dashboard/WelcomeHero';
import StatCard from '@/components/dashboard/StatCard';

interface PersonalReport {
  user_id: string;
  date: string;
  activity: {
    calls_made: number;
    leads_entered: number;
    leads_assigned: number;
    boqs_created: number;
  };
  outcomes: {
    won: { lead_id: string; name: string; deal_value: number | null }[];
    lost_price: number;
    follow_up: number;
  };
}

const egp = new Intl.NumberFormat('en-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The signed-in user's own daily report — where the "📊 تقريرك اليومي"
 * notification lands. Reads live from /api/reports/personal rather than the
 * notification row, because createNotification persists only title/body and
 * drops the report payload it was handed.
 */
export default function MyReportClient() {
  const { profile } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [report, setReport] = useState<PersonalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/personal?date=${forDate}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ غير معروف');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(date); }, [load, date]);

  const wonValue = (report?.outcomes.won || []).reduce(
    (sum, w) => sum + Number(w.deal_value || 0),
    0,
  );
  const totalActivity = report
    ? report.activity.calls_made +
      report.activity.leads_entered +
      report.activity.leads_assigned +
      report.activity.boqs_created
    : 0;

  return (
    <div className="space-y-5 pb-8">
      <WelcomeHero
        name={profile?.name || ''}
        lang="ar"
        subtitle={`تقريرك ليوم ${date}`}
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <button
              onClick={() => setDate(d => shiftDate(d, -1))}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              title="اليوم السابق"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={date}
              max={today}
              onChange={e => e.target.value && setDate(e.target.value)}
              className="border-none bg-transparent text-xs font-semibold text-slate-600 focus:outline-none"
            />
            <button
              onClick={() => setDate(d => (d < today ? shiftDate(d, 1) : d))}
              disabled={date >= today}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
              title="اليوم التالي"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {loading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#D72B2B]" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-900">تعذر تحميل التقرير: {error}</p>
        </div>
      )}

      {!loading && report && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              tone="violet"
              icon={<Phone className="h-5 w-5" />}
              label="مكالمات"
              value={String(report.activity.calls_made)}
              progress={totalActivity > 0 ? Math.round((report.activity.calls_made / totalActivity) * 100) : 0}
              progressCaption={`من ${totalActivity} نشاط النهاردة`}
            />
            <StatCard
              tone="blue"
              icon={<UserPlus className="h-5 w-5" />}
              label="عملاء سجّلتهم"
              value={String(report.activity.leads_entered)}
              progressCaption=""
              progress={totalActivity > 0 ? Math.round((report.activity.leads_entered / totalActivity) * 100) : 0}
            />
            <StatCard
              tone="amber"
              icon={<FileText className="h-5 w-5" />}
              label="عروض أسعار"
              value={String(report.activity.boqs_created)}
              progress={totalActivity > 0 ? Math.round((report.activity.boqs_created / totalActivity) * 100) : 0}
              progressCaption={`عملاء مسندين ليك: ${report.activity.leads_assigned}`}
            />
            <StatCard
              tone="green"
              icon={<Trophy className="h-5 w-5" />}
              label="صفقات مكتملة"
              value={String(report.outcomes.won.length)}
              progress={report.outcomes.won.length > 0 ? 100 : 0}
              progressCaption={wonValue > 0 ? egp.format(wonValue) : 'مفيش صفقات النهاردة'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0D2137]">
                <Trophy className="h-4 w-4 text-emerald-500" />
                الصفقات اللي قفلتها
              </h2>
              {report.outcomes.won.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">مفيش صفقات مقفولة في اليوم ده</p>
              ) : (
                <ul className="space-y-2">
                  {report.outcomes.won.map(w => (
                    <li
                      key={w.lead_id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <Link
                        href={`/my-leads?lead=${w.lead_id}`}
                        className="truncate text-xs font-semibold text-[#0D2137] hover:underline"
                      >
                        {w.name}
                      </Link>
                      <span className="shrink-0 text-xs font-bold text-emerald-600">
                        {w.deal_value ? egp.format(Number(w.deal_value)) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0D2137]">
                <Users className="h-4 w-4 text-slate-400" />
                باقي النتايج
              </h2>
              <dl className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <dt className="text-xs text-slate-500">في التفاوض</dt>
                  <dd className="text-sm font-bold text-[#0D2137]">{report.outcomes.follow_up}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <dt className="text-xs text-slate-500">خسارة</dt>
                  <dd className="text-sm font-bold text-[#0D2137]">{report.outcomes.lost_price}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-xs text-slate-500">عملاء اتسندوا ليك النهاردة</dt>
                  <dd className="text-sm font-bold text-[#0D2137]">{report.activity.leads_assigned}</dd>
                </div>
              </dl>

              <Link
                href="/my-leads"
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#D72B2B] hover:underline"
              >
                افتح عملائي ←
              </Link>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
