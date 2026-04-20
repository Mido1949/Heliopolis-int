'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import { Loader2 } from 'lucide-react';

type DateFilter = 'today' | 'week' | 'month';

interface LeadRow {
  id: string;
  source: string;
  status: string;
  created_at: string;
  assigned_to_team: string | null;
}

interface BOQRow {
  id: string;
  created_at: string;
  grand_total: number;
}

const COLORS = ['#D72B2B', '#0D2137', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];

const SOURCE_AR: Record<string, string> = {
  Meta: 'ميتا',
  WhatsApp: 'واتساب',
  Direct: 'مباشر',
  Phone: 'هاتف',
  Referral: 'إحالة',
};

const STATUS_AR: Record<string, string> = {
  New: 'جديد',
  Interested: 'مهتم',
  'Quote Sent': 'تم إرسال العرض',
  Won: 'فاز',
  Lost: 'خسر',
};

const TEAM_AR: Record<string, string> = {
  tech: 'تقني',
  cs: 'خدمة عملاء',
};

const FILTER_LABELS: Record<DateFilter, string> = {
  today: 'اليوم',
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
};

function fmtDate(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getRange(filter: DateFilter) {
  const now = new Date();
  const to = now.toISOString();
  if (filter === 'today') {
    return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), to };
  }
  if (filter === 'week') {
    return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString(), to };
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to };
}

function getDayBuckets(filter: DateFilter): string[] {
  const now = new Date();
  const count = filter === 'today' ? 1 : filter === 'week' ? 7 : now.getDate();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - i));
    return fmtDate(d);
  });
}

function groupCount(rows: { key: string }[]): { name: string; value: number }[] {
  const map: Record<string, number> = {};
  rows.forEach(r => { map[r.key] = (map[r.key] || 0) + 1; });
  return Object.entries(map).map(([k, v]) => ({ name: k, value: v }));
}

const ChartCard = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-6">
    <h3 className="text-sm font-bold text-[#0D2137] mb-0.5">{title}</h3>
    <p className="text-[10px] text-slate-400 mb-4">{subtitle}</p>
    {children}
  </div>
);

const Empty = () => (
  <p className="text-center text-xs text-slate-400 py-12">لا توجد بيانات في هذه الفترة</p>
);

export default function DashboardCharts() {
  const supabase = createClient();
  const [filter, setFilter] = useState<DateFilter>('month');
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [boqs, setBoqs] = useState<BOQRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getRange(filter);
    const [{ data: leadsData }, { data: boqsData }] = await Promise.all([
      supabase
        .from('leads')
        .select('id, source, status, created_at, assigned_to_team')
        .gte('created_at', from)
        .lte('created_at', to),
      supabase
        .from('boqs')
        .select('id, created_at, grand_total')
        .gte('created_at', from)
        .lte('created_at', to),
    ]);
    setLeads((leadsData as LeadRow[]) || []);
    setBoqs((boqsData as BOQRow[]) || []);
    setLoading(false);
  }, [filter, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 1. Leads by Source
  const sourceData = groupCount(leads.map(l => ({ key: SOURCE_AR[l.source] || l.source })));

  // 2. Leads by Status
  const statusData = groupCount(leads.map(l => ({ key: STATUS_AR[l.status] || l.status })));

  // 3. Leads per day
  const buckets = getDayBuckets(filter);
  const dailyMap: Record<string, number> = Object.fromEntries(buckets.map(b => [b, 0]));
  leads.forEach(l => {
    const k = fmtDate(new Date(l.created_at));
    if (k in dailyMap) dailyMap[k]++;
  });
  const dailyData = buckets.map(date => ({ date, count: dailyMap[date] }));

  // 4. Team Performance
  const teamMap: Record<string, { total: number; won: number }> = {
    tech: { total: 0, won: 0 },
    cs: { total: 0, won: 0 },
  };
  leads.forEach(l => {
    const t = l.assigned_to_team;
    if (t && teamMap[t]) {
      teamMap[t].total++;
      if (l.status === 'Won') teamMap[t].won++;
    }
  });
  const teamData = Object.entries(teamMap).map(([team, d]) => ({
    name: TEAM_AR[team] || team,
    إجمالي: d.total,
    فاز: d.won,
  }));

  // 5. BOQ Revenue over time
  const boqMap: Record<string, number> = {};
  boqs.forEach(b => {
    const k = fmtDate(new Date(b.created_at));
    boqMap[k] = (boqMap[k] || 0) + Number(b.grand_total);
  });
  const boqTimeData = Object.entries(boqMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));

  // 6. Conversion Rate
  const totalLeads = leads.length;
  const wonLeads = leads.filter(l => l.status === 'Won').length;
  const convRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;
  const convData = [
    { name: 'فاز', value: wonLeads, fill: '#10B981' },
    { name: 'باقي', value: Math.max(totalLeads - wonLeads, 0), fill: '#E2E8F0' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D2137]">تحليل الأداء</h2>
          <p className="text-xs text-slate-500">Performance Analytics</p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {(Object.keys(FILTER_LABELS) as DateFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                filter === f
                  ? 'bg-white text-[#0D2137] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-100 shadow-sm p-6 h-72 flex items-center justify-center animate-pulse">
              <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 1. Leads by Source — Pie */}
          <ChartCard title="الليدات حسب المصدر" subtitle="Leads by Source">
            {sourceData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={false}
                  >
                    {sourceData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* 2. Leads by Status — Bar */}
          <ChartCard title="الليدات حسب الحالة" subtitle="Leads by Status">
            {statusData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statusData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" name="ليد" radius={[4, 4, 0, 0]}>
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* 3. Leads per Day — Line */}
          <ChartCard title="الليدات يومياً" subtitle="Leads per Day">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="ليد"
                  stroke="#D72B2B"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#D72B2B' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 4. Team Performance — Bar */}
          <ChartCard title="أداء الفرق" subtitle="Team Performance">
            {teamData.every(t => t['إجمالي'] === 0) ? <Empty /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={teamData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="إجمالي" fill="#0D2137" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="فاز" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* 5. BOQ Revenue over Time — Line */}
          <ChartCard title="إيرادات المقايسات" subtitle="BOQ Revenue over Time">
            {boqTimeData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={boqTimeData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} EGP`, 'الإيراد']} />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="الإيراد"
                    stroke="#0D2137"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#0D2137' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* 6. Conversion Rate — Donut + KPI */}
          <ChartCard title="معدل التحويل" subtitle="Conversion Rate">
            <div className="flex items-center gap-6">
              <div className="relative flex-shrink-0">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={convData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={72}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      strokeWidth={0}
                    >
                      {convData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-extrabold text-[#0D2137]">{convRate}%</span>
                  <span className="text-[10px] text-slate-400">معدل الفوز</span>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">إجمالي الليدات</span>
                  <span className="font-bold text-[#0D2137]">{totalLeads}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">الصفقات الفائزة</span>
                  <span className="font-bold text-emerald-600">{wonLeads}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">معدل التحويل</span>
                  <span className="font-bold text-[#D72B2B]">{convRate}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-700"
                    style={{ width: `${convRate}%` }}
                  />
                </div>
              </div>
            </div>
          </ChartCard>

        </div>
      )}
    </div>
  );
}
