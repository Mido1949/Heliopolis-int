'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Form, Select, InputNumber, Button, message, Tag } from 'antd';
import { DatePicker } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Download, Loader2, Target, TrendingUp, BarChart2 } from 'lucide-react';
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

const CHART_COLORS = ['#D72B2B', '#0D2137', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];

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
  const [loading, setLoading] = useState(true);

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

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const [
      { data: profilesData },
      { data: metaData },
      { data: targetsData },
      { data: monthLeadsData },
    ] = await Promise.all([
      supabase.from('profiles').select('*').order('name'),
      supabase
        .from('leads')
        .select('id, name, phone, source, status, form_id, created_at, assigned_to_user')
        .eq('source', 'Meta')
        .gte('created_at', campaignRange[0].startOf('day').toISOString())
        .lte('created_at', campaignRange[1].endOf('day').toISOString()),
      supabase
        .from('sales_targets')
        .select('*, profile:user_id(name)')
        .gte('period_start', monthStart.slice(0, 10))
        .lte('period_end', monthEnd.slice(0, 10))
        .order('created_at', { ascending: false }),
      supabase
        .from('leads')
        .select('assigned_to_user')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd)
        .not('assigned_to_user', 'is', null),
    ]);

    const allProfiles = (profilesData as Profile[]) || [];
    setProfiles(allProfiles);
    setMetaLeads((metaData as MetaLead[]) || []);

    const rawTargets = (targetsData || []) as SalesTarget[];
    setTargets(rawTargets);

    // Build user progress
    const leadsCountMap: Record<string, number> = {};
    (monthLeadsData || []).forEach((r: { assigned_to_user: string | null }) => {
      if (r.assigned_to_user) {
        leadsCountMap[r.assigned_to_user] = (leadsCountMap[r.assigned_to_user] || 0) + 1;
      }
    });

    const leadsTargetMap: Record<string, number> = {};
    rawTargets.filter(t => t.target_type === 'leads').forEach(t => {
      leadsTargetMap[t.user_id] = Number(t.target_value);
    });

    const progress: UserProgress[] = allProfiles.map(p => {
      const actual = leadsCountMap[p.id] || 0;
      const target = leadsTargetMap[p.id] ?? null;
      const pct = target ? Math.round((actual / target) * 100) : 0;
      return { id: p.id, name: p.name, leadsTarget: target, actualLeads: actual, progress: pct };
    }).filter(p => p.leadsTarget !== null || p.actualLeads > 0);

    setUserProgress(progress);
    setLoading(false);
  }, [supabase, campaignRange]);

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

  // ── CSV Export ────────────────────────────────────────────────────────────

  const handleExport = () => {
    const rows: string[][] = [];
    rows.push(['الاسم', 'الهاتف', 'المصدر', 'الحالة', 'معرف الحملة', 'تاريخ الإنشاء']);
    metaLeads.forEach(l => {
      rows.push([l.name, l.phone, l.source, l.status, l.form_id || '', l.created_at]);
    });
    rows.push([]);
    rows.push(['المستخدم', 'نوع الهدف', 'قيمة الهدف', 'من', 'إلى']);
    targets.forEach(t => {
      rows.push([
        t.profile?.name || t.user_id,
        t.target_type === 'leads' ? 'ليدات' : 'إيراد',
        String(t.target_value),
        t.period_start,
        t.period_end,
      ]);
    });

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loomark-report-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
            {/* Table */}
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

            {/* Bar chart */}
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
        {/* Admin: Create Target Form */}
        {isAdmin && (
          <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-sm font-bold text-[#0D2137] mb-4">إضافة هدف جديد</h3>
            <Form form={targetForm} layout="inline" onFinish={handleCreateTarget} className="flex flex-wrap gap-2">
              <Form.Item name="user_id" rules={[{ required: true, message: 'اختر مستخدم' }]} className="mb-2">
                <Select
                  placeholder="المستخدم"
                  showSearch
                  optionFilterProp="label"
                  style={{ width: 160 }}
                  options={profiles.map(p => ({ value: p.id, label: p.name }))}
                />
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
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={savingTarget}
                  style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
                >
                  حفظ الهدف
                </Button>
              </Form.Item>
            </Form>
          </div>
        )}

        {/* Targets Table */}
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
                    <td className="py-2.5 pr-2 font-semibold text-[#0D2137]">
                      {t.profile?.name || '—'}
                    </td>
                    <td className="text-center py-2.5">
                      <Tag color={t.target_type === 'leads' ? 'blue' : 'green'}>
                        {t.target_type === 'leads' ? 'ليدات' : 'إيراد'}
                      </Tag>
                    </td>
                    <td className="text-center py-2.5 font-bold text-[#0D2137]">
                      {t.target_type === 'leads'
                        ? t.target_value
                        : `${Number(t.target_value).toLocaleString()} EGP`}
                    </td>
                    <td className="text-center py-2.5 text-slate-500 text-xs">{t.period_start}</td>
                    <td className="text-center py-2.5 text-slate-500 text-xs">{t.period_end}</td>
                    {isAdmin && (
                      <td className="text-center py-2.5">
                        <button
                          onClick={() => handleDeleteTarget(t.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          حذف
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Section 3: Target Progress Dashboard ── */}
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
                    <span className="text-xs text-slate-500">
                      {u.actualLeads} / {u.leadsTarget ?? '—'} ليد
                    </span>
                    <span className={`text-xs font-bold ${progressTextColor(u.progress)}`}>
                      {u.leadsTarget ? `${Math.min(u.progress, 100)}%` : '—'}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  {u.leadsTarget ? (
                    <div
                      className={`h-3 rounded-full transition-all duration-700 ${progressColor(u.progress)}`}
                      style={{ width: `${Math.min(u.progress, 100)}%` }}
                    />
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

      {/* ── Section 4: Export ── */}
      <SectionCard
        title="تصدير التقرير"
        subtitle="Export Report as CSV"
        icon={<Download className="w-5 h-5" />}
      >
        <p className="text-sm text-slate-600 mb-4">
          تصدير بيانات الليدات من Meta مع بيانات الأهداف الشهرية كملف CSV.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0D2137] text-white rounded-lg text-sm font-semibold hover:bg-[#1a3a5c] transition-colors"
          >
            <Download className="w-4 h-4" />
            تحميل CSV
          </button>
          <div className="text-xs text-slate-400 flex items-center">
            {metaLeads.length} ليد من Meta · {targets.length} هدف مسجل
          </div>
        </div>
      </SectionCard>

      {/* Migration notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-bold mb-1">⚠️ تذكير: تشغيل Migration</p>
        <p>إذا لم تشغّل ملف <code className="bg-amber-100 px-1 rounded">20260419_reports.sql</code> بعد، قم بتشغيله في Supabase SQL Editor لإنشاء جدول الأهداف وإضافة عمود form_id للليدات.</p>
      </div>
    </div>
  );
}
