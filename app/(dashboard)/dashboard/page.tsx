/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  Users,
  Briefcase,
  FileText,
  Trophy,
  AlertTriangle,
  ShoppingCart,
  UserPlus,
  FilePlus,
  Loader2
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLeads: 0,
    newLeads: 0,
    wonLeads: 0,
    totalRevenue: 0,
    sentBOQs: 0,
  });

  const [recentLeads, setRecentLeads] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [leaderboard, setLeaderboard] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      try {
        // 1. Fetch KPI Counts
        const { count: totalLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true });
        const { count: newLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'New');
        const { count: wonLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'Won');
        
        // 2. Fetch Revenue (from Joined BOQs or mock logic if none won yet)
        const { data: wonBoqs } = await supabase.from('boqs').select('grand_total').eq('status', 'Paid');
        const totalRevenue = wonBoqs?.reduce((acc, curr) => acc + Number(curr.grand_total), 0) || 0;
        
        const { count: sentBOQs } = await supabase.from('boqs').select('*', { count: 'exact', head: true }).neq('status', 'Draft');

        setStats({
          totalLeads: totalLeads || 0,
          newLeads: newLeads || 0,
          wonLeads: wonLeads || 0,
          totalRevenue,
          sentBOQs: sentBOQs || 0
        });

        // 3. Recent Leads
        const { data: leads } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(3);
        setRecentLeads(leads || []);

        // 4. Leaderboard (from Profiles)
        const { data: profiles } = await supabase.from('profiles').select('id, name, score, avatar_url, role').order('score', { ascending: false }).limit(5);
        setLeaderboard(profiles || []);

        // 5. Low Stock Alert
        const { data: lowStock } = await supabase.from('products').select('*').lt('stock_quantity', 5).limit(2);
        setLowStockProducts(lowStock || []);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [supabase]);

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
              <Link href="/dashboard/crm" className="text-[10px] font-bold text-[#D72B2B] uppercase tracking-wider hover:underline">
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
            {leaderboard.map((user, idx) => (
              <div key={user.id} className={`flex items-center justify-between p-3 rounded-xl transition-transform ${idx === 0 ? 'bg-slate-50 hover:scale-[1.02]' : 'hover:bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 flex items-center justify-center font-bold ${idx === 0 ? 'text-[#D72B2B]' : idx === 1 ? 'text-slate-500' : 'text-slate-400'}`}>
                    {idx === 0 ? <Trophy className="w-5 h-5" /> : `0${idx + 1}`}
                  </div>
                  <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm bg-slate-200 overflow-hidden flex items-center justify-center text-slate-500 font-bold">
                    {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" alt={user.name} /> : user.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0D2137] truncate w-24">{user.name}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold uppercase">
                      {user.role}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-black text-[#0D2137]">{user.score} pts</p>
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
                <Link href="/dashboard/inventory" className="p-1.5 bg-white rounded-md text-[#D72B2B] shadow-sm hover:bg-slate-50">
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
            <Link href="/dashboard/crm" className="flex flex-col items-center justify-center p-6 bg-[#D72B2B] text-white rounded-lg hover:bg-[#93000e] transition-colors group text-center">
              <UserPlus className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold">New Lead</span>
              <span className="text-[10px] opacity-70">طلب جديد</span>
            </Link>
            <Link href="/dashboard/boq" className="flex flex-col items-center justify-center p-6 bg-[#0D2137] text-white rounded-lg hover:bg-[#000917] transition-colors group text-center">
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
