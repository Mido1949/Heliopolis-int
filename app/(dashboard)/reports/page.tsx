'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { Form, Select, InputNumber, Button, message, Tag, Tabs } from 'antd';
import { DatePicker } from 'antd';
import DailyReport from './DailyReport';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { Download, Loader2, Target, TrendingUp, BarChart2, CheckSquare, Users, Wrench, FileText, Calendar } from 'lucide-react';
import dayjs from 'dayjs';
import type { Profile } from '@/types';

const { RangePicker } = DatePicker;

// ── Types ────────────────────────────────────────────────────────────────────

interface SalesTarget {
  id: string;
  user_id: string;
  target_type: 'leads' | 'revenue';
  target_value: number;
  period_start: string;
  period_end: string;
  created_at: string;
  profile?: { name: string } | null;
}

interface MetaLead {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: string;
  form_id: string | null;
  created_at: string;
  assigned_to_user: string | null;
  created_by: string | null;
  creator_name?: string;
  assignee_name?: string;
}

interface AllLead {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  email: string | null;
  source: string;
  status: string;
  client_type: string | null;
  region: string | null;
  notes: string | null;
  created_at: string;
  assigned_to_user: string | null;
  assignee_name?: string;
}

interface AfterSalesRow {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  installation_date: string;
  system_description: string | null;
  unit_count: number;
  technician_name: string | null;
  status: string;
  next_maintenance_date: string | null;
  last_maintenance_date: string | null;
  notes: string | null;
  created_at: string;
}

interface BOQRow {
  id: string;
  boq_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  grand_total: number;
  created_at: string;
  profile?: { name: string } | null;
}

interface CampaignRow {
  form_id: string;
  label: string;
  total: number;
  won: number;
  rate: number;
}

interface UserProgress {
  id: string;
  name: string;
  leadsTarget: number | null;
  actualLeads: number;
  progress: number;
}

interface UserTaskStats {
  id: string;
  name: string;
  done: number;
  pending: number;
  total: number;
}

const CHART_COLORS = ['#D72B2B', '#0D2137', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];

const STATUS_COLORS: Record<string, string> = {
  New: '#3B82F6',
  Interested: '#F59E0B',
  'Quote Sent': '#8B5CF6',
  Won: '#10B981',
  Lost: '#EF4444',
  Draft: '#8C8C8C',
  Sent: '#1890FF',
  Paid: '#52C41A',
  Cancelled: '#FF4D4F',
  active: '#10B981',
  maintenance_due: '#F59E0B',
  overdue: '#EF4444',
  inactive: '#8C8C8C',
};

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

// ── Main Component ───────────────────────────────────────────────────────────

export default function ReportsPage() {
  const supabase = createClient();
  const { isAdmin, user } = useAuth();
  const { currentOrgId } = useOrg();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportRange, setExportRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'), dayjs(),
  ]);
  const [exportPreset, setExportPreset] = useState<'today' | 'week' | 'month' | 'custom'>('month');

  const applyExportPreset = (preset: 'today' | 'week' | 'month') => {
    setExportPreset(preset);
    if (preset === 'today') setExportRange([dayjs().startOf('day'), dayjs().endOf('day')]);
    else if (preset === 'week') setExportRange([dayjs().startOf('week'), dayjs().endOf('week')]);
    else setExportRange([dayjs().startOf('month'), dayjs().endOf('month')]);
  };

  // Global date range filter
  const [globalRange, setGlobalRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'), dayjs(),
  ]);
  const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'custom'>('month');

  const applyPreset = (preset: 'today' | 'week' | 'month') => {
    setActivePreset(preset);
    if (preset === 'today') setGlobalRange([dayjs().startOf('day'), dayjs().endOf('day')]);
    else if (preset === 'week') setGlobalRange([dayjs().startOf('week'), dayjs().endOf('week')]);
    else setGlobalRange([dayjs().startOf('month'), dayjs().endOf('month')]);
  };

  // Section 1 state
  const [metaLeads, setMetaLeads] = useState<MetaLead[]>([]);
  const [campaignRange, setCampaignRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'), dayjs(),
  ]);

  // Section 2 state
  const [targets, setTargets] = useState<SalesTarget[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetForm] = Form.useForm();

  // Section 3 state
  const [userProgress, setUserProgress] = useState<UserProgress[]>([]);

  // Section 4 state (task stats)
  const [userTaskStats, setUserTaskStats] = useState<UserTaskStats[]>([]);

  // Overview chart states
  const [leadsByStatus, setLeadsByStatus] = useState<{ name: string; value: number; fill: string }[]>([]);
  const [boqByStatus, setBoqByStatus] = useState<{ name: string; value: number; fill: string }[]>([]);
  const [afterSalesByStatus, setAfterSalesByStatus] = useState<{ name: string; value: number; fill: string }[]>([]);
  const [leadsBySource, setLeadsBySource] = useState<{ name: string; value: number }[]>([]);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const rangeStart = globalRange[0].startOf('day').toISOString();
    const rangeEnd = globalRange[1].endOf('day').toISOString();
    const rangeStartDate = globalRange[0].format('YYYY-MM-DD');
    const rangeEndDate = globalRange[1].format('YYYY-MM-DD');

    const [
      { data: profilesData },
      { data: metaData },
      { data: targetsData },
      { data: monthLeadsData },
      { data: tasksData },
      { data: allLeadsData },
      { data: boqData },
      { data: afterSalesData },
    ] = await Promise.all([
      supabase.from('profiles').select('*').order('name'),
      supabase
        .from('leads')
        .select('id, name, phone, source, status, form_id, created_at, assigned_to_user, created_by')
        .eq('source', 'Meta')
        .gte('created_at', campaignRange[0].startOf('day').toISOString())
        .lte('created_at', campaignRange[1].endOf('day').toISOString()),
      supabase
        .from('sales_targets')
        .select('*, profile:user_id(name)')
        .gte('period_start', rangeStartDate)
        .lte('period_end', rangeEndDate)
        .order('created_at', { ascending: false }),
      supabase
        .from('leads')
        .select('assigned_to_user')
        .gte('created_at', rangeStart)
        .lte('created_at', rangeEnd)
        .not('assigned_to_user', 'is', null),
      supabase
        .from('tasks')
        .select('assigned_to, status')
        .gte('created_at', rangeStart)
        .lte('created_at', rangeEnd),
      supabase
        .from('leads')
        .select('status, source')
        .gte('created_at', rangeStart)
        .lte('created_at', rangeEnd),
      supabase
        .from('boqs')
        .select('status')
        .gte('created_at', rangeStart)
        .lte('created_at', rangeEnd),
      supabase
        .from('after_sales_service')
        .select('status')
        .gte('created_at', rangeStart)
        .lte('created_at', rangeEnd),
    ]);

    const allProfiles = (profilesData as Profile[]) || [];
    setProfiles(allProfiles);
    const profileMap = new Map(allProfiles.map(p => [p.id, p.name]));

    const metaLeadsRaw = (metaData as MetaLead[]) || [];
    setMetaLeads(metaLeadsRaw.map(l => ({
      ...l,
      creator_name: l.created_by ? profileMap.get(l.created_by) || undefined : undefined,
      assignee_name: l.assigned_to_user ? profileMap.get(l.assigned_to_user) || undefined : undefined,
    })));

    const rawTargets = (targetsData || []) as SalesTarget[];
    setTargets(rawTargets);

    // User progress
    const leadsCountMap: Record<string, number> = {};
    (monthLeadsData || []).forEach((r: { assigned_to_user: string | null }) => {
      if (r.assigned_to_user) leadsCountMap[r.assigned_to_user] = (leadsCountMap[r.assigned_to_user] || 0) + 1;
    });
    const leadsTargetMap: Record<string, number> = {};
    rawTargets.filter(t => t.target_type === 'leads').forEach(t => {
      leadsTargetMap[t.user_id] = Number(t.target_value);
    });
    setUserProgress(allProfiles.map(p => {
      const actual = leadsCountMap[p.id] || 0;
      const target = leadsTargetMap[p.id] ?? null;
      const pct = target ? Math.round((actual / target) * 100) : 0;
      return { id: p.id, name: p.name, leadsTarget: target, actualLeads: actual, progress: pct };
    }).filter(p => p.leadsTarget !== null || p.actualLeads > 0));

    // Task stats
    const taskDoneMap: Record<string, number> = {};
    const taskPendingMap: Record<string, number> = {};
    (tasksData || []).forEach((t: { assigned_to: string; status: string }) => {
      if (t.status === 'done') taskDoneMap[t.assigned_to] = (taskDoneMap[t.assigned_to] || 0) + 1;
      else taskPendingMap[t.assigned_to] = (taskPendingMap[t.assigned_to] || 0) + 1;
    });
    setUserTaskStats(allProfiles
      .map(p => ({
        id: p.id, name: p.name,
        done: taskDoneMap[p.id] || 0,
        pending: taskPendingMap[p.id] || 0,
        total: (taskDoneMap[p.id] || 0) + (taskPendingMap[p.id] || 0),
      }))
      .filter(u => u.total > 0)
      .sort((a, b) => b.done - a.done));

    // Overview charts: leads by status
    const statusCount: Record<string, number> = {};
    const sourceCount: Record<string, number> = {};
    (allLeadsData || []).forEach((l: { status: string; source: string }) => {
      statusCount[l.status] = (statusCount[l.status] || 0) + 1;
      sourceCount[l.source] = (sourceCount[l.source] || 0) + 1;
    });
    setLeadsByStatus(Object.entries(statusCount).map(([name, value]) => ({
      name, value, fill: STATUS_COLORS[name] || '#8C8C8C',
    })));
    setLeadsBySource(Object.entries(sourceCount).map(([name, value], i) => ({
      name, value, fill: CHART_COLORS[i % CHART_COLORS.length],
    })));

    // BOQ by status
    const boqCount: Record<string, number> = {};
    (boqData || []).forEach((b: { status: string }) => {
      boqCount[b.status] = (boqCount[b.status] || 0) + 1;
    });
    setBoqByStatus(Object.entries(boqCount).map(([name, value]) => ({
      name, value, fill: STATUS_COLORS[name] || '#8C8C8C',
    })));

    // After Sales by status
    const asCount: Record<string, number> = {};
    (afterSalesData || []).forEach((a: { status: string }) => {
      asCount[a.status] = (asCount[a.status] || 0) + 1;
    });
    setAfterSalesByStatus(Object.entries(asCount).map(([name, value]) => ({
      name, value, fill: STATUS_COLORS[name] || '#8C8C8C',
    })));

    setLoading(false);
  }, [supabase, campaignRange, globalRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Campaign Performance ───────────────────────────────────────────────────

  const campaignMap: Record<string, CampaignRow> = {};
  metaLeads.forEach(l => {
    const key = l.form_id || 'غير محدد';
    if (!campaignMap[key]) campaignMap[key] = { form_id: key, label: key, total: 0, won: 0, rate: 0 };
    campaignMap[key].total++;
    if (l.status === 'Won') campaignMap[key].won++;
  });
  const campaignRows = Object.values(campaignMap).map(r => ({
    ...r,
    rate: r.total > 0 ? Math.round((r.won / r.total) * 100) : 0,
  }));

  // ── Target Creation ────────────────────────────────────────────────────────

  const handleCreateTarget = async (values: {
    user_id: string;
    target_type: 'leads' | 'revenue';
    target_value: number;
    period: [dayjs.Dayjs, dayjs.Dayjs];
  }) => {
    setSavingTarget(true);
    const { error } = await supabase.from('sales_targets').insert({
      user_id: values.user_id,
      target_type: values.target_type,
      target_value: values.target_value,
      period_start: values.period[0].format('YYYY-MM-DD'),
      period_end: values.period[1].format('YYYY-MM-DD'),
      created_by: user?.id,
      org_id: currentOrgId,
    });
    setSavingTarget(false);
    if (error) {
      message.error('فشل حفظ الهدف: ' + error.message);
    } else {
      message.success('تم حفظ الهدف بنجاح');
      targetForm.resetFields();
      fetchAll();
    }
  };

  const handleDeleteTarget = async (id: string) => {
    const { error } = await supabase.from('sales_targets').delete().eq('id', id);
    if (error) { message.error('فشل الحذف'); return; }
    message.success('تم الحذف');
    setTargets(prev => prev.filter(t => t.id !== id));
  };

  // ── Full CSV Export ────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true);
    try {
      const expStart = exportRange[0].startOf('day').toISOString();
      const expEnd = exportRange[1].endOf('day').toISOString();

      const [
        { data: allLeads },
        { data: afterSales },
        { data: boqs },
        { data: allProfiles },
        { data: allTasks },
      ] = await Promise.all([
        supabase.from('leads').select('id, name, phone, company, email, source, status, client_type, region, notes, created_at, assigned_to_user').gte('created_at', expStart).lte('created_at', expEnd).order('created_at', { ascending: false }),
        supabase.from('after_sales_service').select('*').gte('created_at', expStart).lte('created_at', expEnd).order('created_at', { ascending: false }),
        supabase.from('boqs').select('*, profile:created_by(name)').gte('created_at', expStart).lte('created_at', expEnd).order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, name, role'),
        supabase.from('tasks').select('assigned_to, status, title, due_date, priority, created_at').gte('created_at', expStart).lte('created_at', expEnd),
      ]);

      const profileMap = new Map(((allProfiles || []) as { id: string; name: string }[]).map(p => [p.id, p.name]));

      const rows: string[][] = [];

      // ── Section: CRM Leads ──
      rows.push(['=== CRM - كل الليدات ===']);
      rows.push(['الاسم', 'الهاتف', 'الشركة', 'البريد', 'المصدر', 'الحالة', 'نوع العميل', 'المنطقة', 'المسؤول', 'ملاحظات', 'تاريخ الإنشاء']);
      (allLeads || []).forEach((l: AllLead) => {
        rows.push([
          l.name,
          l.phone,
          l.company || '',
          l.email || '',
          l.source,
          l.status,
          l.client_type || '',
          l.region || '',
          l.assigned_to_user ? profileMap.get(l.assigned_to_user) || '' : '',
          l.notes || '',
          dayjs(l.created_at).format('YYYY-MM-DD'),
        ]);
      });

      rows.push([]);

      // ── Section: After Sales ──
      rows.push(['=== ما بعد البيع - After Sales ===']);
      rows.push(['اسم العميل', 'الهاتف', 'العنوان', 'تاريخ التركيب', 'وصف النظام', 'عدد الوحدات', 'الفني', 'الحالة', 'تاريخ الصيانة القادمة', 'آخر صيانة', 'ملاحظات']);
      (afterSales || []).forEach((a: AfterSalesRow) => {
        rows.push([
          a.customer_name,
          a.customer_phone || '',
          a.customer_address || '',
          a.installation_date ? dayjs(a.installation_date).format('YYYY-MM-DD') : '',
          a.system_description || '',
          String(a.unit_count),
          a.technician_name || '',
          a.status,
          a.next_maintenance_date ? dayjs(a.next_maintenance_date).format('YYYY-MM-DD') : '',
          a.last_maintenance_date ? dayjs(a.last_maintenance_date).format('YYYY-MM-DD') : '',
          a.notes || '',
        ]);
      });

      rows.push([]);

      // ── Section: BOQ ──
      rows.push(['=== عروض الأسعار - BOQ ===']);
      rows.push(['رقم BOQ', 'اسم العميل', 'هاتف العميل', 'الحالة', 'الإجمالي', 'الخصم', 'الضريبة', 'الإجمالي النهائي', 'أنشأه', 'تاريخ الإنشاء']);
      (boqs || []).forEach((b: BOQRow) => {
        rows.push([
          b.boq_number,
          b.customer_name || '',
          b.customer_phone || '',
          b.status,
          String(b.subtotal),
          String(b.discount_amount),
          String(b.vat_amount),
          String(b.grand_total),
          b.profile?.name || '',
          dayjs(b.created_at).format('YYYY-MM-DD'),
        ]);
      });

      rows.push([]);

      // ── Section: User Task Detail ──
      rows.push(['=== تفاصيل مهام الموظفين - User Tasks ===']);
      rows.push(['الموظف', 'عنوان المهمة', 'الحالة', 'الأولوية', 'تاريخ الاستحقاق', 'تاريخ الإنشاء']);
      (allTasks || []).forEach((t: { assigned_to: string; status: string; title: string; due_date: string | null; priority: string; created_at: string }) => {
        rows.push([
          profileMap.get(t.assigned_to) || t.assigned_to,
          t.title,
          t.status === 'done' ? 'منجزة' : 'قيد التنفيذ',
          t.priority,
          t.due_date ? dayjs(t.due_date).format('YYYY-MM-DD') : '',
          dayjs(t.created_at).format('YYYY-MM-DD'),
        ]);
      });

      rows.push([]);

      // ── Section: User Summary ──
      rows.push(['=== ملخص أداء الموظفين ===']);
      rows.push(['الموظف', 'الدور', 'ليدات هذا الشهر', 'الهدف', '% التحقيق', 'مهام منجزة', 'مهام معلقة']);
      (allProfiles || []).forEach((p: { id: string; name: string; role: string }) => {
        const up = userProgress.find(u => u.id === p.id);
        const ts = userTaskStats.find(u => u.id === p.id);
        rows.push([
          p.name,
          p.role,
          String(up?.actualLeads || 0),
          String(up?.leadsTarget || '—'),
          up?.leadsTarget ? `${Math.min(up.progress, 100)}%` : '—',
          String(ts?.done || 0),
          String(ts?.pending || 0),
        ]);
      });

      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `heliomax-report-${exportRange[0].format('YYYY-MM-DD')}_${exportRange[1].format('YYYY-MM-DD')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('تم تصدير التقرير الشامل بنجاح');
    } catch {
      message.error('حدث خطأ أثناء التصدير');
    } finally {
      setExporting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-10 w-10 animate-spin text-[#D72B2B]" />
          <p className="text-sm font-medium text-slate-500">جاري تحميل التقارير...</p>
        </div>
      </div>
    );
  }

  return (
    <Tabs
      defaultActiveKey="reports"
      items={[
        {
          key: 'reports',
          label: 'التقارير العامة',
          children: (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="bg-[#0D2137] p-8 rounded-2xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#D72B2B] opacity-10 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            التقارير والأهداف <span className="block md:inline mt-1 md:mt-0 font-arabic text-xl opacity-80">Reports & Targets</span>
          </h1>
          <p className="text-slate-300 mt-2 text-sm">أداء الحملات، الأهداف الشهرية، ونسب التحويل</p>
        </div>
      </div>

      {/* ── Global Date Filter ── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[#0D2137]">
          <Calendar className="w-4 h-4" />
          <span className="text-sm font-bold">الفترة الزمنية:</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'today', label: 'اليوم' },
            { key: 'week', label: 'هذا الأسبوع' },
            { key: 'month', label: 'هذا الشهر' },
          ] as const).map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activePreset === p.key
                  ? 'bg-[#D72B2B] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          <RangePicker
            value={globalRange}
            onChange={(v) => {
              if (v?.[0] && v?.[1]) {
                setGlobalRange([v[0], v[1]]);
                setActivePreset('custom');
              }
            }}
            size="small"
            className="text-xs"
          />
        </div>
        <div className="mr-auto text-xs text-slate-400">
          {globalRange[0].format('DD/MM/YYYY')} — {globalRange[1].format('DD/MM/YYYY')}
        </div>
      </div>

      {/* ── Overview Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CRM Leads by Status */}
        <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[#0D2137]" />
            <h3 className="text-sm font-bold text-[#0D2137]">توزيع الليدات</h3>
          </div>
          {leadsByStatus.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">لا توجد بيانات</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={leadsByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                  {leadsByStatus.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* BOQ by Status */}
        <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-[#0D2137]" />
            <h3 className="text-sm font-bold text-[#0D2137]">عروض الأسعار (BOQ)</h3>
          </div>
          {boqByStatus.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">لا توجد بيانات</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={boqByStatus} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="عدد" radius={[4, 4, 0, 0]}>
                  {boqByStatus.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* After Sales by Status */}
        <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-4 h-4 text-[#0D2137]" />
            <h3 className="text-sm font-bold text-[#0D2137]">ما بعد البيع</h3>
          </div>
          {afterSalesByStatus.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">لا توجد بيانات</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={afterSalesByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ value }) => `${value}`} labelLine={false} fontSize={10}>
                  {afterSalesByStatus.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Leads by Source chart */}
      {leadsBySource.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-[#0D2137]" />
            <h3 className="text-sm font-bold text-[#0D2137]">الليدات حسب المصدر</h3>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={leadsBySource} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="عدد الليدات" radius={[4, 4, 0, 0]}>
                {leadsBySource.map((entry, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Section 1: Campaign Performance ── */}
      <SectionCard
        title="أداء الحملات الإعلانية"
        subtitle="Campaign Performance — Meta Lead Ads"
        icon={<BarChart2 className="w-5 h-5" />}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <span className="text-xs font-medium text-slate-500">الفترة الزمنية:</span>
          <RangePicker
            value={campaignRange}
            onChange={(v) => { if (v?.[0] && v?.[1]) setCampaignRange([v[0], v[1]]); }}
            size="small"
            className="text-xs"
          />
        </div>

        {campaignRows.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">لا توجد ليدات من Meta في هذه الفترة</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500 font-semibold">
                    <th className="text-right py-2 pr-2">الحملة / Form ID</th>
                    <th className="text-center py-2">إجمالي</th>
                    <th className="text-center py-2">فاز</th>
                    <th className="text-center py-2">نسبة التحويل</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignRows.map(r => (
                    <tr key={r.form_id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 pr-2 font-mono text-xs text-[#0D2137] max-w-[180px] truncate">{r.label}</td>
                      <td className="text-center py-2.5 font-bold text-[#0D2137]">{r.total}</td>
                      <td className="text-center py-2.5 font-bold text-emerald-600">{r.won}</td>
                      <td className="text-center py-2.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          r.rate >= 30 ? 'bg-emerald-100 text-emerald-700' :
                          r.rate >= 10 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>{r.rate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={campaignRows} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" name="إجمالي الليدات" radius={[4, 4, 0, 0]}>
                  {campaignRows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* ── Section 2: Sales Targets ── */}
      <SectionCard
        title="الأهداف الشهرية"
        subtitle="Sales Targets"
        icon={<Target className="w-5 h-5" />}
      >
        {isAdmin && (
          <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-sm font-bold text-[#0D2137] mb-4">إضافة هدف جديد</h3>
            <Form form={targetForm} layout="inline" onFinish={handleCreateTarget} className="flex flex-wrap gap-2">
              <Form.Item name="user_id" rules={[{ required: true, message: 'اختر مستخدم' }]} className="mb-2">
                <Select placeholder="المستخدم" showSearch optionFilterProp="label" style={{ width: 160 }}
                  options={profiles.map(p => ({ value: p.id, label: p.name }))} />
              </Form.Item>
              <Form.Item name="target_type" rules={[{ required: true }]} className="mb-2">
                <Select placeholder="نوع الهدف" style={{ width: 140 }} options={[
                  { value: 'leads', label: 'عدد الليدات' },
                  { value: 'revenue', label: 'الإيراد (EGP)' },
                ]} />
              </Form.Item>
              <Form.Item name="target_value" rules={[{ required: true, type: 'number', min: 1 }]} className="mb-2">
                <InputNumber placeholder="القيمة" min={1} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="period" rules={[{ required: true, message: 'اختر الفترة' }]} className="mb-2">
                <RangePicker size="middle" />
              </Form.Item>
              <Form.Item className="mb-2">
                <Button type="primary" htmlType="submit" loading={savingTarget}
                  style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}>
                  حفظ الهدف
                </Button>
              </Form.Item>
            </Form>
          </div>
        )}

        {targets.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-6">لا توجد أهداف مسجلة لهذا الشهر</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 font-semibold">
                  <th className="text-right py-2 pr-2">المستخدم</th>
                  <th className="text-center py-2">نوع الهدف</th>
                  <th className="text-center py-2">القيمة</th>
                  <th className="text-center py-2">من</th>
                  <th className="text-center py-2">إلى</th>
                  {isAdmin && <th className="text-center py-2">حذف</th>}
                </tr>
              </thead>
              <tbody>
                {targets.map(t => (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 pr-2 font-semibold text-[#0D2137]">{t.profile?.name || '—'}</td>
                    <td className="text-center py-2.5">
                      <Tag color={t.target_type === 'leads' ? 'blue' : 'green'}>
                        {t.target_type === 'leads' ? 'ليدات' : 'إيراد'}
                      </Tag>
                    </td>
                    <td className="text-center py-2.5 font-bold text-[#0D2137]">
                      {t.target_type === 'leads' ? t.target_value : `${Number(t.target_value).toLocaleString()} EGP`}
                    </td>
                    <td className="text-center py-2.5 text-slate-500 text-xs">{t.period_start}</td>
                    <td className="text-center py-2.5 text-slate-500 text-xs">{t.period_end}</td>
                    {isAdmin && (
                      <td className="text-center py-2.5">
                        <button onClick={() => handleDeleteTarget(t.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium">حذف</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Section 3: Target Progress ── */}
      <SectionCard
        title="لوحة التقدم نحو الأهداف"
        subtitle="Target Progress Dashboard — هذا الشهر"
        icon={<TrendingUp className="w-5 h-5" />}
      >
        {userProgress.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-6">لا توجد أهداف مسجلة. قم بإضافة أهداف من القسم أعلاه.</p>
        ) : (
          <div className="space-y-5">
            {userProgress.map(u => (
              <div key={u.id} className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-[#0D2137]">{u.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{u.actualLeads} / {u.leadsTarget ?? '—'} ليد</span>
                    <span className={`text-xs font-bold ${progressTextColor(u.progress)}`}>
                      {u.leadsTarget ? `${Math.min(u.progress, 100)}%` : '—'}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  {u.leadsTarget ? (
                    <div className={`h-3 rounded-full transition-all duration-700 ${progressColor(u.progress)}`}
                      style={{ width: `${Math.min(u.progress, 100)}%` }} />
                  ) : (
                    <div className="h-3 bg-slate-200 rounded-full w-full" />
                  )}
                </div>
                <div className="flex justify-end">
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${
                    !u.leadsTarget ? 'text-slate-400' :
                    u.progress >= 80 ? 'text-emerald-600' :
                    u.progress >= 50 ? 'text-amber-500' : 'text-red-500'
                  }`}>
                    {!u.leadsTarget ? 'لا يوجد هدف' :
                     u.progress >= 80 ? '🟢 على المسار' :
                     u.progress >= 50 ? '🟡 متوسط' : '🔴 يحتاج متابعة'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Section 4: User Task Stats ── */}
      <SectionCard
        title="إنجاز المهام لكل موظف"
        subtitle="Task Completion by User"
        icon={<CheckSquare className="w-5 h-5" />}
      >
        {userTaskStats.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-6">لا توجد مهام مسجلة بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 font-semibold">
                  <th className="text-right py-2 pr-2">الموظف</th>
                  <th className="text-center py-2">منجزة</th>
                  <th className="text-center py-2">قيد التنفيذ</th>
                  <th className="text-center py-2">الإجمالي</th>
                  <th className="text-center py-2 pl-2">نسبة الإنجاز</th>
                </tr>
              </thead>
              <tbody>
                {userTaskStats.map(u => {
                  const pct = u.total > 0 ? Math.round((u.done / u.total) * 100) : 0;
                  return (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-2 font-semibold text-[#0D2137]">{u.name}</td>
                      <td className="text-center py-3">
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{u.done}
                        </span>
                      </td>
                      <td className="text-center py-3">
                        <span className="inline-flex items-center gap-1 text-amber-600 font-bold">
                          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{u.pending}
                        </span>
                      </td>
                      <td className="text-center py-3 font-bold text-[#0D2137]">{u.total}</td>
                      <td className="text-center py-3 pl-2">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className={`h-2 rounded-full transition-all duration-700 ${progressColor(pct)}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-xs font-bold w-10 text-right ${progressTextColor(pct)}`}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="py-2.5 pr-2 text-xs font-bold text-slate-500">الإجمالي</td>
                  <td className="text-center py-2.5 font-bold text-emerald-700">{userTaskStats.reduce((s, u) => s + u.done, 0)}</td>
                  <td className="text-center py-2.5 font-bold text-amber-600">{userTaskStats.reduce((s, u) => s + u.pending, 0)}</td>
                  <td className="text-center py-2.5 font-bold text-[#0D2137]">{userTaskStats.reduce((s, u) => s + u.total, 0)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Section 5: Full Export ── */}
      <SectionCard
        title="تصدير التقرير الشامل"
        subtitle="Export Full Report as CSV"
        icon={<Download className="w-5 h-5" />}
      >
        <p className="text-sm text-slate-600 mb-4">
          تصدير شامل يتضمن: كل الليدات (CRM) · ما بعد البيع · عروض الأسعار (BOQ) · تفاصيل مهام كل موظف
        </p>

        {/* Export date filter */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-4">
          <p className="text-xs font-bold text-slate-500 mb-3">اختر الفترة للتصدير:</p>
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'today', label: 'اليوم' },
              { key: 'week', label: 'هذا الأسبوع' },
              { key: 'month', label: 'هذا الشهر' },
            ] as const).map(p => (
              <button
                key={p.key}
                onClick={() => applyExportPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  exportPreset === p.key
                    ? 'bg-[#0D2137] text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
            <RangePicker
              value={exportRange}
              onChange={(v) => {
                if (v?.[0] && v?.[1]) {
                  setExportRange([v[0], v[1]]);
                  setExportPreset('custom');
                }
              }}
              size="small"
            />
            <span className="text-xs text-slate-400 mr-1">
              {exportRange[0].format('DD/MM/YYYY')} — {exportRange[1].format('DD/MM/YYYY')}
            </span>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#D72B2B] text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? 'جاري التصدير...' : 'تحميل التقرير الشامل CSV'}
        </button>
      </SectionCard>
    </div>
          ),
        },
        {
          key: 'daily',
          label: '📊 النشاط اليومي',
          children: <DailyReport />,
        },
      ]}
    />
  );
}
