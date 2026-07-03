'use client';

import { useState, useEffect, useCallback } from 'react';
import { DatePicker, Progress, Tag, Spin } from 'antd';
import { Filter, TrendingDown, Clock, Trophy } from 'lucide-react';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface FunnelStageRow {
  stage: string;
  labelAr: string;
  count: number;
  conversionFromPrev: number | null;
  avgDaysInStage: number | null;
}
interface WinRateRow {
  key: string;
  label: string;
  won: number;
  lost: number;
  winRate: number;
}
interface FunnelReportData {
  range: { from: string | null; to: string | null };
  totalLeads: number;
  funnel: FunnelStageRow[];
  overallWinRate: WinRateRow;
  bySource: WinRateRow[];
  byRep: WinRateRow[];
}

function winRateColor(pct: number) {
  if (pct >= 60) return '#16A34A';
  if (pct >= 30) return '#FA8C16';
  return '#FF4D4F';
}

const SectionCard = ({ title, subtitle, icon, children }: {
  title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode;
}) => (
  <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-6">
    <div className="flex items-center gap-3 mb-6">
      <div className="p-2.5 bg-slate-50 rounded-xl text-[#0D2137]">{icon}</div>
      <div>
        <h2 className="text-base font-bold text-[#0D2137]">{title}</h2>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </div>
    {children}
  </div>
);

const WinRateTable = ({ rows }: { rows: WinRateRow[] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-xs text-slate-500 font-semibold">
          <th className="text-right py-2 pr-2">الاسم</th>
          <th className="text-center py-2">فاز</th>
          <th className="text-center py-2">خسر</th>
          <th className="text-center py-2 pl-2">نسبة الفوز</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td className="py-2.5 pr-2 font-semibold text-[#0D2137]">{r.label}</td>
            <td className="text-center py-2.5 font-bold text-emerald-600">{r.won}</td>
            <td className="text-center py-2.5 font-bold text-red-500">{r.lost}</td>
            <td className="text-center py-2.5 pl-2">
              <div className="flex items-center justify-center gap-2">
                <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full" style={{ width: `${Math.min(r.winRate, 100)}%`, backgroundColor: winRateColor(r.winRate) }} />
                </div>
                <span className="text-xs font-bold w-12 text-left" style={{ color: winRateColor(r.winRate) }}>{r.winRate}%</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function FunnelReport() {
  const [data, setData] = useState<FunnelReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'), dayjs(),
  ]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const from = range[0].startOf('day').toISOString();
      const to = range[1].endOf('day').toISOString();
      const res = await fetch(`/api/reports/funnel?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (res.status === 403) { setForbidden(true); setData(null); return; }
      if (!res.ok) { setData(null); return; }
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const maxCount = data ? Math.max(1, ...data.funnel.map((f) => f.count)) : 1;

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-[#0D2137] p-8 rounded-2xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#D72B2B] opacity-10 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            قمع المبيعات <span className="block md:inline mt-1 md:mt-0 font-arabic text-xl opacity-80">Conversion Funnel</span>
          </h1>
          <p className="text-slate-300 mt-2 text-sm">نِسَب التحويل بين المراحل، متوسط زمن كل مرحلة، ونسبة الفوز حسب المصدر والمندوب</p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[#0D2137]">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-bold">الفترة (تاريخ الإنشاء):</span>
        </div>
        <RangePicker
          value={range}
          onChange={(v) => { if (v?.[0] && v?.[1]) setRange([v[0], v[1]]); }}
          size="small"
        />
        {data && <span className="mr-auto text-xs text-slate-400">إجمالي الليدات في الفترة: <strong className="text-[#0D2137]">{data.totalLeads}</strong></span>}
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center"><Spin size="large" /></div>
      ) : forbidden ? (
        <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-10 text-center text-slate-400">
          هذا التقرير متاح للقادة والمديرين فقط.
        </div>
      ) : !data ? (
        <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-10 text-center text-slate-400">
          تعذّر تحميل التقرير.
        </div>
      ) : (
        <>
          {/* Funnel bars */}
          <SectionCard title="قمع التحويل" subtitle="Stage funnel & conversion" icon={<TrendingDown className="w-5 h-5" />}>
            <div className="space-y-3">
              {data.funnel.map((f) => (
                <div key={f.stage}>
                  <div className="flex items-center justify-between mb-1 text-sm">
                    <span className="font-semibold text-[#0D2137]">{f.labelAr}</span>
                    <div className="flex items-center gap-3">
                      {f.conversionFromPrev !== null && (
                        <Tag color={f.conversionFromPrev >= 60 ? 'green' : f.conversionFromPrev >= 30 ? 'orange' : 'red'} style={{ margin: 0, fontSize: 10 }}>
                          ↓ {f.conversionFromPrev}%
                        </Tag>
                      )}
                      <span className="font-bold text-[#0D2137] w-12 text-left">{f.count}</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-lg h-6 overflow-hidden">
                    <div
                      className="h-6 rounded-lg bg-gradient-to-l from-[#D72B2B] to-[#0D2137] flex items-center px-2 transition-all duration-700"
                      style={{ width: `${Math.max((f.count / maxCount) * 100, f.count > 0 ? 6 : 0)}%` }}
                    >
                      {f.avgDaysInStage !== null && (
                        <span className="text-[10px] text-white/90 whitespace-nowrap flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {f.avgDaysInStage} يوم
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-4">
              النسبة = عدد ليدات المرحلة ÷ المرحلة السابقة. الزمن = متوسط المدة قبل الانتقال للمرحلة التالية. (المراحل الأقدم قد تنقص طوابعها الزمنية فتُحسب بأمان.)
            </p>
          </SectionCard>

          {/* Overall win rate */}
          <SectionCard title="نسبة الفوز الإجمالية" subtitle="Overall win rate — WON / (WON + LOST)" icon={<Trophy className="w-5 h-5" />}>
            <div className="flex items-center gap-6 flex-wrap">
              <Progress
                type="circle"
                percent={data.overallWinRate.winRate}
                strokeColor={winRateColor(data.overallWinRate.winRate)}
                format={(p) => `${p}%`}
                size={120}
              />
              <div className="space-y-1">
                <p className="text-sm text-slate-500">فاز: <strong className="text-emerald-600">{data.overallWinRate.won}</strong></p>
                <p className="text-sm text-slate-500">خسر: <strong className="text-red-500">{data.overallWinRate.lost}</strong></p>
                <p className="text-sm text-slate-500">إجمالي المحسوم: <strong className="text-[#0D2137]">{data.overallWinRate.won + data.overallWinRate.lost}</strong></p>
              </div>
            </div>
          </SectionCard>

          {/* Win rate by source & by rep */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="نسبة الفوز حسب المصدر" subtitle="Win rate by source" icon={<Trophy className="w-5 h-5" />}>
              {data.bySource.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-6">لا توجد صفقات محسومة في الفترة</p>
              ) : <WinRateTable rows={data.bySource} />}
            </SectionCard>
            <SectionCard title="نسبة الفوز حسب المندوب" subtitle="Win rate by rep" icon={<Trophy className="w-5 h-5" />}>
              {data.byRep.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-6">لا توجد صفقات محسومة في الفترة</p>
              ) : <WinRateTable rows={data.byRep} />}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
