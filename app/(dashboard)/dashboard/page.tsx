/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { ACTIVE_PIPELINE_STAGES } from '@/lib/constants';
import DashboardCharts from './DashboardCharts';
import {
  Users,
  Briefcase,
  FileText,
  Trophy,
  AlertTriangle,
  ShoppingCart,
  UserPlus,
  FilePlus,
  Loader2,
  Phone,
  ClipboardList,
} from 'lucide-react';
import Link from 'next/link';

interface DailyReportRow {
  user_id: string;
  user_name: string;
  user_role: string;
  leads_created: number;
  updates_done: number;
  calls_made: number;
  boqs_created: number;
}

interface MonthlyProgress {
  leadsTarget: number | null;
  actualLeads: number;
  progress: number;
}

function progressColor(pct: number) {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-500';
}

function progressTextColor(pct: number) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-500';
  return 'text-red-500';
}

export default function DashboardPage() {
  const supabase = createClient();
  const { isAdmin, isManager, isTeamLeader, user } = useAuth();
  const { currentOrgId } = useOrg();
  const canSeeFullReport = isAdmin || isManager || isTeamLeader;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLeads: 0,
    newLeads: 0,
    totalRevenue: 0,
    sentBOQs: 0,
  });

  const [pipeline, setPipeline] = useState<{
    activeCount: number;
    pipelineValue: number;
    conversionRate: string;
    byStage: Record<string, number>;
  }>({ activeCount: 0, pipelineValue: 0, conversionRate: '0%', byStage: {} });

  const [recentLeads, setRecentLeads] = useState<{ id: string; name: string; source: string; status: string; created_at: string }[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ id: string; name: string; score: number; avatar_url?: string; role: string }[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<{ id: string; name: string; stock_quantity: number }[]>([]);
  const [dailyReport, setDailyReport] = useState<DailyReportRow[]>([]);
  const [monthlyProgress, setMonthlyProgress] = useState<Record<string, MonthlyProgress>>({});

  useEffect(() => {
    async function fetchDashboardData() {
      if (!currentOrgId) return;
      setLoading(true);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      try {
        const [
          { count: totalLeads },
          { count: newLeads },
          { data: wonBoqs },
          { count: sentBOQs },
          { data: leads },
          { data: profiles },
          { data: lowStock },
          { data: reportData },
          { data: targetsData },
          { data: monthLeadsData },
          { data: pipelineLeads },
        ] = await Promise.all([
          supabase.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', currentOrgId),
          supabase.from('leads').select('*', { count: 'exact', head: true }).eq('org_id', currentOrgId).eq('status', 'New'),
          supabase.from('boqs').select('grand_total').eq('org_id', currentOrgId).eq('status', 'Paid'),
          supabase.from('boqs').select('*', { count: 'exact', head: true }).eq('org_id', currentOrgId).neq('status', 'Draft'),
          supabase.from('leads').select('id, name, source, status, created_at').eq('org_id', currentOrgId).order('created_at', { ascending: false }).limit(3),
          supabase.from('profiles').select('id, name, score, avatar_url, role').eq('org_id', currentOrgId).order('score', { ascending: false }).limit(5),
          supabase.from('products').select('id, name, stock_quantity').eq('org_id', currentOrgId).lt('stock_quantity', 5).limit(2),
          supabase.rpc('get_daily_activity_report'),
          supabase.from('sales_targets').select('user_id, target_value').eq('org_id', currentOrgId).eq('target_type', 'leads').gte('period_start', monthStart.slice(0, 10)).lte('period_end', monthEnd.slice(0, 10)),
          supabase.from('leads').select('assigned_to_user').eq('org_id', currentOrgId).gte('created_at', monthStart).lte('created_at', monthEnd).not('assigned_to_user', 'is', null),
          supabase.from('leads').select('pipeline_stage, deal_value').eq('org_id', currentOrgId),
        ]);

        const totalRevenue = wonBoqs?.reduce((acc, curr) => acc + Number(curr.grand_total), 0) || 0;

        setStats({
          totalLeads: totalLeads || 0,
          newLeads: newLeads || 0,
          totalRevenue,
          sentBOQs: sentBOQs || 0,
        });
        setRecentLeads(leads || []);
        setLeaderboard(profiles || []);
        setLowStockProducts(lowStock || []);

        // For non-privileged users, filter to show only own row
        const rows: DailyReportRow[] = (reportData as DailyReportRow[] | null) || [];
        setDailyReport(canSeeFullReport ? rows : rows.filter(r => r.user_id === user?.id));

        // Build monthly progress map
        const leadsTargetMap: Record<string, number> = {};
        (targetsData || []).forEach((t: { user_id: string; target_value: number }) => {
          leadsTargetMap[t.user_id] = Number(t.target_value);
        });
        const leadsCountMap: Record<string, number> = {};
        (monthLeadsData || []).forEach((r: { assigned_to_user: string | null }) => {
          if (r.assigned_to_user) {
            leadsCountMap[r.assigned_to_user] = (leadsCountMap[r.assigned_to_user] || 0) + 1;
          }
        });
        const progressMap: Record<string, MonthlyProgress> = {};
        const allUserIds = new Set([...Object.keys(leadsTargetMap), ...Object.keys(leadsCountMap)]);
        allUserIds.forEach(uid => {
          const target = leadsTargetMap[uid] ?? null;
          const actual = leadsCountMap[uid] || 0;
          const pct = target ? Math.round((actual / target) * 100) : 0;
          progressMap[uid] = { leadsTarget: target, actualLeads: actual, progress: pct };
        });
        setMonthlyProgress(progressMap);

        // Pipeline KPIs (T042)
        const byStage: Record<string, number> = {};
        let activeCount = 0;
        let pipelineValue = 0;
        let wonCount = 0;
        let newCount = 0;
        (pipelineLeads || []).forEach((l: { pipeline_stage?: string; deal_value?: number | null }) => {
          const stage = l.pipeline_stage || 'NEW';
          byStage[stage] = (byStage[stage] || 0) + 1;
          if (ACTIVE_PIPELINE_STAGES.includes(stage as typeof ACTIVE_PIPELINE_STAGES[number])) {
            activeCount += 1;
            pipelineValue += Number(l.deal_value || 0);
          }
          if (stage === 'WON') wonCount += 1;
          if (stage === 'NEW') newCount += 1;
        });
        const conversionRate = newCount > 0 ? ((wonCount / newCount) * 100).toFixed(2) + '%' : '0%';
        setPipeline({ activeCount, pipelineValue, conversionRate, byStage });

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [currentOrgId, isAdmin, isManager, isTeamLeader, user, canSeeFullReport]); // eslint-disable-line react-hooks/exhaustive-deps

  const topPerformer = leaderboard.length > 0 ? leaderboard[0] : null;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-10 w-10 animate-spin text-[#D72B2B]" />
          <p className="text-sm font-medium text-slate-500">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-8">

      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0D2137] p-8 rounded-2xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#D72B2B] opacity-10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Welcome back! 👋 <span className="block md:inline mt-1 md:mt-0 font-arabic text-xl opacity-80">أهلاً بك مجدداً</span>
          </h1>
          <p className="text-slate-300 mt-2 text-sm md:text-base font-medium">
            Here&apos;s what&apos;s happening with GCHV Egypt today.
          </p>
        </div>
        <div className="relative z-10 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#D72B2B]">Current Status</p>
          <p className="text-lg font-mono font-bold">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
          <div className="flex items-center gap-2 justify-end mt-1 text-slate-300 text-xs">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            System Active
          </div>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* Total Leads */}
        <div className="bg-white p-6 rounded-lg shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow border border-slate-100">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-[#0D2137] transition-colors">
              <Users className="w-6 h-6 text-[#0D2137] group-hover:text-white" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 font-medium flex justify-between">Total Leads <span>إجمالي الطلبات</span></p>
            <h3 className="text-2xl font-extrabold text-[#0D2137] mt-1">{stats.totalLeads}</h3>
          </div>
        </div>

        {/* Active Deals */}
        <div className="bg-white p-6 rounded-lg shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow border border-slate-100">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-[#0D2137] transition-colors">
              <Briefcase className="w-6 h-6 text-[#0D2137] group-hover:text-white" />
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-[#D72B2B] tracking-tighter uppercase">High Value</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 font-medium flex justify-between">Active Deals <span>الصفقات النشطة</span></p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-extrabold text-[#0D2137] mt-1">{stats.newLeads}</h3>
              <span className="text-sm font-medium text-slate-400">{formatCurrency(stats.totalRevenue)}</span>
            </div>
          </div>
        </div>

        {/* BOQs Sent */}
        <div className="bg-white p-6 rounded-lg shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow border border-slate-100">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-[#0D2137] transition-colors">
              <FileText className="w-6 h-6 text-[#0D2137] group-hover:text-white" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 font-medium flex justify-between">BOQs Sent <span>المقايسات المرسلة</span></p>
            <h3 className="text-2xl font-extrabold text-[#0D2137] mt-1">{stats.sentBOQs}</h3>
          </div>
        </div>

        {/* Top Performer */}
        <div className="bg-white p-6 rounded-lg shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow border border-slate-100">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-[#0D2137] transition-colors">
              <Trophy className="w-6 h-6 text-[#0D2137] group-hover:text-white" />
            </div>
            {topPerformer && (
              <div className="w-8 h-8 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-xs font-bold overflow-hidden">
                {topPerformer.avatar_url ? (
                  <img src={topPerformer.avatar_url} alt="Top" className="w-full h-full object-cover" />
                ) : (
                  topPerformer.name?.charAt(0).toUpperCase()
                )}
              </div>
            )}
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 font-medium flex justify-between">Top Performer <span>الأفضل أداءً</span></p>
            <h3 className="text-lg font-bold text-[#0D2137] mt-1 truncate">{topPerformer ? topPerformer.name : 'N/A'}</h3>
            <p className="text-[10px] font-bold text-[#D72B2B] uppercase tracking-wide">{topPerformer ? `${topPerformer.score} Points` : '0 Points'}</p>
          </div>
        </div>

      </div>

      {/* Pipeline KPIs (T042) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <p className="text-xs text-slate-500 font-medium flex justify-between">Active Pipeline <span>العملاء النشطون</span></p>
          <h3 className="text-2xl font-extrabold text-[#0D2137] mt-1">{pipeline.activeCount}</h3>
          <p className="text-[10px] text-slate-400 mt-1">In stages NEW → NEGOTIATION</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <p className="text-xs text-slate-500 font-medium flex justify-between">Pipeline Value <span>قيمة القمع</span></p>
          <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">${pipeline.pipelineValue.toLocaleString()}</h3>
          <p className="text-[10px] text-slate-400 mt-1">Sum of deal_value on active leads</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <p className="text-xs text-slate-500 font-medium flex justify-between">Conversion Rate <span>معدل التحويل</span></p>
          <h3 className="text-2xl font-extrabold text-[#D72B2B] mt-1">{pipeline.conversionRate}</h3>
          <p className="text-[10px] text-slate-400 mt-1">WON / NEW (lifetime)</p>
        </div>
      </div>

      {/* Daily Activity Report */}
      {dailyReport.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-5 h-5 text-[#D72B2B]" />
              <div>
                <h3 className="text-sm font-bold text-[#0D2137]">تقرير النشاط اليومي</h3>
                <p className="text-xs text-slate-400">ما فعله كل عضو فريق اليوم</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-right py-3 px-6 text-xs font-bold text-slate-500">الموظف</th>
                  <th className="text-center py-3 px-4 text-xs font-bold text-blue-600">
                    <div className="flex flex-col items-center gap-0.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>ليدز</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-bold text-amber-600">
                    <div className="flex flex-col items-center gap-0.5">
                      <ClipboardList className="w-3.5 h-3.5" />
                      <span>تحديثات</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-bold text-green-600">
                    <div className="flex flex-col items-center gap-0.5">
                      <Phone className="w-3.5 h-3.5" />
                      <span>مكالمات</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-bold text-purple-600">
                    <div className="flex flex-col items-center gap-0.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>BOQs</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-bold text-slate-600">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {dailyReport.map(row => {
                  const total = row.leads_created + row.updates_done + row.calls_made + row.boqs_created;
                  return (
                    <tr key={row.user_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-6">
                        <p className="font-semibold text-[#0D2137]">{row.user_name}</p>
                        <span className="text-[10px] text-slate-400">{row.user_role}</span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className={`text-base font-black ${row.leads_created > 0 ? 'text-blue-600' : 'text-slate-200'}`}>
                          {row.leads_created}
                        </span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className={`text-base font-black ${row.updates_done > 0 ? 'text-amber-500' : 'text-slate-200'}`}>
                          {row.updates_done}
                        </span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className={`text-base font-black ${row.calls_made > 0 ? 'text-green-600' : 'text-slate-200'}`}>
                          {row.calls_made}
                        </span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className={`text-base font-black ${row.boqs_created > 0 ? 'text-purple-600' : 'text-slate-200'}`}>
                          {row.boqs_created}
                        </span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full font-black text-sm ${
                          total === 0
                            ? 'bg-slate-100 text-slate-400'
                            : total >= 10
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {total}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Monthly Progress Section */}
          {dailyReport.some(r => monthlyProgress[r.user_id]?.leadsTarget) && (
            <div className="px-6 py-5 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">التقدم نحو هدف الشهر</p>
              <div className="space-y-4">
                {dailyReport.map(row => {
                  const prog = monthlyProgress[row.user_id];
                  if (!prog || prog.leadsTarget === null) return null;
                  const capped = Math.min(prog.progress, 100);
                  return (
                    <div key={row.user_id}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-semibold text-[#0D2137]">{row.user_name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">{prog.actualLeads} / {prog.leadsTarget} ليد</span>
                          <span className={`text-xs font-bold ${progressTextColor(prog.progress)}`}>{capped}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-3 rounded-full transition-all duration-700 ${progressColor(prog.progress)}`}
                          style={{ width: `${capped}%` }}
                        />
                      </div>
                      <div className="flex justify-end mt-0.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${
                          prog.progress >= 80 ? 'text-emerald-600' :
                          prog.progress >= 50 ? 'text-amber-500' : 'text-red-500'
                        }`}>
                          {prog.progress >= 80 ? 'على المسار' : prog.progress >= 50 ? 'متوسط' : 'يحتاج متابعة'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts Section */}
      <DashboardCharts />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Summary Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Leads Feed */}
          <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-100 h-full">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-lg font-bold text-[#0D2137]">Activity Feed</h3>
                <p className="text-xs text-slate-500">آخر المستجدات</p>
              </div>
              <Link href="/crm" className="text-[10px] font-bold text-[#D72B2B] uppercase tracking-wider hover:underline">
                View All
              </Link>
            </div>

            <div className="relative space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
              {recentLeads.map((lead, idx) => (
                <div key={lead.id} className="relative pl-8">
                  <div className="absolute left-0 top-1.5 w-[24px] h-[24px] bg-white flex items-center justify-center">
                    <div className={`w-3 h-3 rounded-full ring-4 ring-white ${idx === 0 ? 'bg-[#D72B2B]' : idx === 1 ? 'bg-[#0D2137]' : 'bg-slate-400'}`}></div>
                  </div>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-bold text-[#0D2137]">{lead.name}</p>
                      <p className="text-[11px] text-slate-500 mt-1">Status: {lead.status}</p>
                      <div className="flex gap-2 mt-2">
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 font-bold flex items-center gap-1 border border-slate-200">
                          {lead.source}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
              {recentLeads.length === 0 && (
                <div className="text-sm text-slate-500 text-center py-4 italic">No recent activity detected.</div>
              )}
            </div>
          </div>
        </div>

        {/* Leaderboard Column */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-[#0D2137]">Top Performers</h3>
              <p className="text-xs text-slate-500">متصدري الأداء</p>
            </div>
          </div>

          <div className="space-y-4">
            {leaderboard.map((u, idx) => (
              <div key={u.id} className={`flex items-center justify-between p-3 rounded-xl transition-transform ${idx === 0 ? 'bg-slate-50 hover:scale-[1.02]' : 'hover:bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 flex items-center justify-center font-bold ${idx === 0 ? 'text-[#D72B2B]' : idx === 1 ? 'text-slate-500' : 'text-slate-400'}`}>
                    {idx === 0 ? <Trophy className="w-5 h-5" /> : `0${idx + 1}`}
                  </div>
                  <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm bg-slate-200 overflow-hidden flex items-center justify-center text-slate-500 font-bold">
                    {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt={u.name} /> : u.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0D2137] truncate w-24">{u.name}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold uppercase">
                      {u.role}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-black text-[#0D2137]">{u.score} pts</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Alerts & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Alerts */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="text-amber-500 w-6 h-6" />
            <h3 className="text-lg font-bold text-[#0D2137]">Low Stock Alerts</h3>
          </div>
          <div className="space-y-3">
            {lowStockProducts.map(p => (
              <div key={p.id} className="flex justify-between items-center p-3 bg-red-50/50 rounded-lg border border-red-100/30">
                <div>
                  <p className="text-xs font-bold text-[#0D2137]">{p.name}</p>
                  <p className="text-[10px] text-slate-500">{p.stock_quantity} units remaining (Min: 5)</p>
                </div>
                <Link href="/inventory" className="p-1.5 bg-white rounded-md text-[#D72B2B] shadow-sm hover:bg-slate-50">
                  <ShoppingCart className="w-4 h-4" />
                </Link>
              </div>
            ))}
            {lowStockProducts.length === 0 && (
              <div className="text-xs text-slate-400 italic py-2">No critical inventory alerts today.</div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-[#0D2137] mb-6">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <Link href="/crm" className="flex flex-col items-center justify-center p-6 bg-[#D72B2B] text-white rounded-lg hover:bg-[#93000e] transition-colors group text-center">
              <UserPlus className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold">New Lead</span>
              <span className="text-[10px] opacity-70">طلب جديد</span>
            </Link>
            <Link href="/boq" className="flex flex-col items-center justify-center p-6 bg-[#0D2137] text-white rounded-lg hover:bg-[#000917] transition-colors group text-center">
              <FilePlus className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold">New BOQ</span>
              <span className="text-[10px] opacity-70">مقايسة جديدة</span>
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
