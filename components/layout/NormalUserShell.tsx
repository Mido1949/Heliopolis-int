'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { createClient } from '@/lib/supabase/client';
import Navbar from './Navbar';
import NotificationBell from './NotificationBell';
import { createAutoCallTask } from '@/lib/tasks/auto-create';
import { formatDate } from '@/lib/utils';
import {
  Phone, FileText, Plus, CheckCircle2,
  Clock, Calendar, TrendingUp, Sparkles, Send, X, ListChecks, UserCircle2,
  BarChart2, CheckSquare, ChevronRight, Download, LogOut,
} from 'lucide-react';

interface NormalUserShellProps {
  children: React.ReactNode;
}

interface Msg { role: 'user' | 'assistant'; content: string; widget?: 'team_select' | 'call_outcome'; }

type PostLeadStep = 'ask_call' | 'call_duration' | 'call_notes' | 'follow_up' | 'ask_transfer' | null;
type CallFlowStep = 'ask_lead' | 'ask_duration' | 'ask_description' | 'ask_outcome' | null;

interface CallFlowData {
  leadId?: string;
  leadName?: string;
  leadMatches?: { id: string; name: string; phone: string | null }[];
  duration?: number;
  description?: string;
}

interface PostLeadData {
  leadId: string;
  leadName: string;
  hadCall: boolean;
  callDuration?: number;
  callNotes?: string;
  followUpDate?: string;
}

interface LeadDraft {
  name?: string;
  phone?: string;
  region?: string;
  project_type?: string;
  source?: string;
  budget_range?: string;
}

const LEAD_STEP_LABELS: { key: keyof LeadDraft; question: string; placeholder?: string }[] = [
  { key: 'name',         question: 'تمام! ✨ إيه اسم العميل؟',          placeholder: 'الاسم الكامل' },
  { key: 'phone',        question: 'رقم تليفونه كام؟ (مع كود الدولة لو بره مصر)', placeholder: '+201XXXXXXXXX' },
  { key: 'region',       question: 'منطقة العميل فين؟',                placeholder: 'Cairo / Alexandria / Riyadh / Jeddah / Other' },
  { key: 'project_type', question: 'نوع المشروع إيه؟',                  placeholder: 'شقة، فيلا، مكتب...' },
  { key: 'source',       question: 'العميل ده جه منين؟',                placeholder: 'WhatsApp / Meta / Direct / Phone' },
  { key: 'budget_range', question: 'الميزانية التقريبية كام؟',           placeholder: '50000 EGP' },
];

function parseBudget(text: string): number | null {
  const digits = text.replace(/[^\d.]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function normalizeRegion(s: string): string {
  const v = s.trim();
  const lo = v.toLowerCase();
  const map: Record<string, string> = {
    'القاهرة': 'Cairo', 'قاهرة': 'Cairo',
    'الاسكندرية': 'Alexandria', 'اسكندرية': 'Alexandria', 'اسكندريه': 'Alexandria', 'اسكندريا': 'Alexandria',
    'الرياض': 'Riyadh', 'رياض': 'Riyadh',
    'جدة': 'Jeddah', 'جده': 'Jeddah',
    'الجيزة': 'Giza', 'جيزة': 'Giza', 'جيزه': 'Giza',
    'المعادي': 'Maadi', 'المعادى': 'Maadi',
    'مدينة نصر': 'Nasr City', 'نصر': 'Nasr City',
    'الشروق': 'El Shorouk', 'شروق': 'El Shorouk',
    'العبور': 'El Obour', 'بدر': 'Badr City',
    'الدمام': 'Dammam', 'دمام': 'Dammam',
    'أبو ظبي': 'Abu Dhabi', 'ابوظبي': 'Abu Dhabi', 'ابو ظبي': 'Abu Dhabi',
    'دبي': 'Dubai', 'الكويت': 'Kuwait',
    'طرابلس': 'Tripoli', 'بنغازي': 'Benghazi',
    'cairo': 'Cairo', 'alex': 'Alexandria', 'alexandria': 'Alexandria',
    'riyadh': 'Riyadh', 'jeddah': 'Jeddah', 'jeda': 'Jeddah',
    'giza': 'Giza', 'maadi': 'Maadi', 'nasr city': 'Nasr City',
    'dammam': 'Dammam', 'dubai': 'Dubai', 'abu dhabi': 'Abu Dhabi',
    'kuwait': 'Kuwait', 'other': 'Other', 'اخري': 'Other', 'أخرى': 'Other',
  };
  if (map[v]) return map[v];
  if (map[lo]) return map[lo];
  return v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function normalizeSource(s: string): string {
  const v = s.trim();
  const lo = v.toLowerCase();
  const map: Record<string, string> = {
    'واتساب': 'WhatsApp', 'واتس': 'WhatsApp', 'واتس اب': 'WhatsApp', 'وتساب': 'WhatsApp',
    'ميتا': 'Meta', 'فيسبوك': 'Meta', 'فيس بوك': 'Meta',
    'مباشر': 'Direct', 'مباشرة': 'Direct',
    'تليفون': 'Phone', 'تلفون': 'Phone', 'اتصال': 'Phone', 'مكالمة': 'Phone',
    'انستجرام': 'Instagram', 'انستا': 'Instagram',
    'توصية': 'Referral', 'معرفة': 'Referral',
    'موقع': 'Website', 'تيك توك': 'TikTok',
    'whatsapp': 'WhatsApp', 'whats': 'WhatsApp',
    'meta': 'Meta', 'facebook': 'Meta', 'fb': 'Meta',
    'direct': 'Direct',
    'phone': 'Phone', 'call': 'Phone',
    'instagram': 'Instagram', 'insta': 'Instagram',
    'referral': 'Referral', 'ref': 'Referral',
    'website': 'Website', 'web': 'Website',
    'tiktok': 'TikTok',
  };
  if (map[v]) return map[v];
  if (map[lo]) return map[lo];
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function HelioAvatar({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ display: 'block', borderRadius: '50%' }}>
      <circle cx="28" cy="28" r="28" fill="#F5A623" />
      <path d="M12 27 Q12 8 28 8 Q44 8 44 27 L44 22 Q44 6 28 6 Q12 6 12 22 Z" fill="#1C1A17" />
      <rect x="11" y="21" width="5.5" height="17" rx="2.5" fill="#1C1A17" />
      <rect x="39.5" y="21" width="5.5" height="17" rx="2.5" fill="#1C1A17" />
      <ellipse cx="28" cy="33" rx="14" ry="16" fill="#FDCBA0" />
      <path d="M13 22 Q28 13 43 22" stroke="#2C2C2C" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <ellipse cx="12.5" cy="24.5" rx="4" ry="5" fill="#2C2C2C" />
      <ellipse cx="12.5" cy="24.5" rx="2.3" ry="3.2" fill="#555" />
      <path d="M12.5 30 Q8 35 9 40" stroke="#2C2C2C" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <ellipse cx="9.2" cy="41.5" rx="2.2" ry="2.8" fill="#2C2C2C" />
      <ellipse cx="22.5" cy="31" rx="2.6" ry="2.8" fill="#2C2C2C" />
      <ellipse cx="33.5" cy="31" rx="2.6" ry="2.8" fill="#2C2C2C" />
      <circle cx="23.4" cy="29.8" r="0.85" fill="white" />
      <circle cx="34.4" cy="29.8" r="0.85" fill="white" />
      <circle cx="18"  cy="36" r="4.5" fill="#FFB3B3" opacity="0.38" />
      <circle cx="38"  cy="36" r="4.5" fill="#FFB3B3" opacity="0.38" />
      <path d="M22 39 Q28 45.5 34 39" stroke="#C07878" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function NormalUserShell({ children }: NormalUserShellProps) {
  const { user, profile } = useAuth();
  const { currentOrgId } = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  // Routes that replace the center chat column with the page's own content.
  const isFullPageRoute =
    pathname === '/my-leads' || pathname?.startsWith('/my-leads/') ||
    pathname === '/tasks'    || pathname?.startsWith('/tasks/') ||
    pathname?.startsWith('/boq');

  const [showMyReport, setShowMyReport] = useState(false);

  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  // Lead creation flow state
  const [leadFlowActive, setLeadFlowActive] = useState(false);
  const [leadStep, setLeadStep] = useState(0);
  const [leadDraft, setLeadDraft] = useState<LeadDraft>({});
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);

  // Post-lead flow state (call summary → follow-up → team transfer)
  const [postLeadStep, setPostLeadStep] = useState<PostLeadStep>(null);
  const [postLeadData, setPostLeadData] = useState<PostLeadData | null>(null);

  // Standalone call log flow state
  const [callFlowStep, setCallFlowStep] = useState<CallFlowStep>(null);
  const [callFlowData, setCallFlowData] = useState<CallFlowData | null>(null);

  // Daily report & BOQ data
  const [kpis, setKpis] = useState<{ myLeads: number; myBOQs: number; callsToday: number; tasksOpen: number }>({
    myLeads: 0, myBOQs: 0, callsToday: 0, tasksOpen: 0,
  });
  const [followUps, setFollowUps] = useState<{ id: string; name: string; next_follow_up: string | null }[]>([]);
  const [pendingTasks, setPendingTasks] = useState<{ id: string; title: string; due_date: string | null }[]>([]);
  const [recentBoqs, setRecentBoqs] = useState<{ id: string; boq_number: string; customer_name: string | null; grand_total: number; status: string; created_at: string }[]>([]);
  const [panelsLoading, setPanelsLoading] = useState(true);
  // Today's detail data for the daily report
  const [leadsToday, setLeadsToday] = useState<{ id: string; name: string; phone: string | null; source: string | null; status: string | null }[]>([]);
  const [callsTodayDetails, setCallsTodayDetails] = useState<{ id: string; outcome: string | null; duration_minutes: number | null; notes: string | null; lead_name: string | null }[]>([]);

  useEffect(() => {
    setLang((document.documentElement.lang as 'ar' | 'en') || 'ar');
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, leadStep]);

  // Greeting
  useEffect(() => {
    if (!profile || greetedRef.current) return;
    greetedRef.current = true;
    const firstName = (profile.name || 'يا صديقي').split(' ')[0];
    setMessages([
      {
        role: 'assistant',
        content: `أهلاً يا ${firstName}! 👋\nأنا هيليو، مساعدك في HelioMax.\nاسألني أي حاجة عن العملاء، المنتجات، أو عروض الأسعار — أو اكتب "سجّل عميل" وأنا هسجّلهولك سطر بسطر ✅`,
      },
    ]);
  }, [profile]);

  // Load side-panel data
  const loadPanels = useCallback(async () => {
    if (!user) return;
    setPanelsLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    try {
      const [leadsRes, boqsRes, callsRes, tasksRes, followRes, pendingRes, leadsTodayRes, callsDetailRes] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to_user', user.id),
        supabase.from('boqs').select('id, boq_number, customer_name, grand_total, status, created_at')
          .eq('created_by', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('call_logs').select('id', { count: 'exact', head: true })
          .eq('created_by', user.id).gte('created_at', todayIso),
        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id).eq('status', 'pending'),
        supabase.from('leads').select('id, name, next_follow_up')
          .eq('assigned_to_user', user.id)
          .not('next_follow_up', 'is', null)
          .order('next_follow_up', { ascending: true })
          .limit(5),
        supabase.from('tasks').select('id, title, due_date')
          .eq('assigned_to', user.id).eq('status', 'pending')
          .order('due_date', { ascending: true }).limit(5),
        // Today's new leads (created today by this user)
        supabase.from('leads').select('id, name, phone, source, status')
          .eq('created_by', user.id).gte('created_at', todayIso)
          .order('created_at', { ascending: false }),
        // Today's calls with lead name
        supabase.from('call_logs').select('id, outcome, duration_minutes, notes, leads(name)')
          .eq('created_by', user.id).gte('created_at', todayIso)
          .order('created_at', { ascending: false }),
      ]);

      setKpis({
        myLeads: leadsRes.count || 0,
        myBOQs: (boqsRes.data || []).length,
        callsToday: callsRes.count || 0,
        tasksOpen: tasksRes.count || 0,
      });

      setRecentBoqs((boqsRes.data || []) as typeof recentBoqs);
      setFollowUps((followRes.data || []) as typeof followUps);
      setPendingTasks((pendingRes.data || []) as typeof pendingTasks);
      setLeadsToday((leadsTodayRes.data || []) as typeof leadsToday);
      setCallsTodayDetails(
        ((callsDetailRes.data || []) as unknown[]).map((r: unknown) => {
          const row = r as { id: string; outcome: string | null; duration_minutes: number | null; notes: string | null; leads: { name: string } | null };
          return { id: row.id, outcome: row.outcome, duration_minutes: row.duration_minutes, notes: row.notes, lead_name: row.leads?.name ?? null };
        })
      );
    } catch (err) {
      console.error('[NormalUserShell] loadPanels error:', err);
    } finally {
      setPanelsLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => { loadPanels(); }, [loadPanels]);

  // Realtime refresh for side panels
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`normal-user-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => loadPanels())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boqs' }, () => loadPanels())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadPanels())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, supabase, loadPanels]);

  const handleLogout = async () => {
    const supabase = createClient();
    try { await supabase.auth.signOut(); } catch {}
    router.push('/login');
    router.refresh();
  };

  const toggleLang = () => setLang(prev => (prev === 'ar' ? 'en' : 'ar'));

  // Send a message to /api/agent/chat
  const callAgent = useCallback(async (msgs: Msg[], system: string): Promise<{ content: string; action?: string; nextQuestion?: string; fieldKey?: string; step?: number; totalSteps?: number }> => {
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, system }),
      });
      const data = await res.json();
      return {
        content: data.content ?? 'عذراً، حصل خطأ!',
        action: data.action,
        nextQuestion: data.nextQuestion,
        fieldKey: data.fieldKey,
        step: data.step,
        totalSteps: data.totalSteps,
      };
    } catch {
      return { content: 'عذراً، مش قادر أوصل للسيرفر!' };
    }
  }, []);

  // Validate each step's answer
  const validateStep = (key: keyof LeadDraft, value: string): string | null => {
    const v = value.trim();
    if (!v) return 'الإجابة مطلوبة';
    if (key === 'name' && v.length < 2) return 'الاسم قصير جداً';
    if (key === 'phone' && v.replace(/\D/g, '').length < 7) return 'رقم التليفون غير صحيح';
    // region and source accept any input — normalized on store
    return null;
  };

  const saveLead = useCallback(async (draft: LeadDraft) => {
    if (!user) return;
    setLeadSaving(true);
    setLeadError(null);
    try {
      const budget = parseBudget(draft.budget_range || '');
      const now = new Date().toISOString();
      const leadId = crypto.randomUUID();
      const orgId = currentOrgId || profile?.org_id || null;
      const { error } = await supabase.from('leads').insert({
        id: leadId,
        name: (draft.name || '').trim(),
        phone: (draft.phone || '').trim(),
        region: (draft.region || '').trim() || null,
        source: (draft.source || 'Direct').trim(),
        status: 'New',
        pipeline_stage: 'NEW',
        stage_timestamps: { NEW: now },
        deal_value: budget,
        notes: draft.project_type ? `Project: ${draft.project_type}` : null,
        assigned_to_user: user.id,
        assigned_to_team: 'cs',
        created_by: user.id,
        org_id: orgId,
      });
      if (error) throw error;

      // T015: auto-create "اتصل بـ" task (non-blocking, swallowed errors)
      if (user.id) {
        try {
          await createAutoCallTask({
            leadId,
            leadName: (draft.name || '').trim(),
            assignedTo: user.id,
            orgId,
            createdBy: user.id,
          });
        } catch {
          // intentional: never block the lead save on task creation
        }
      }

      setLeadFlowActive(false);
      setLeadStep(0);
      setLeadDraft({});

      // Start post-lead flow
      setPostLeadData({ leadId, leadName: draft.name || '', hadCall: false });
      setPostLeadStep('ask_call');
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `ممتاز! ✅ تم تسجيل "${draft.name}" بنجاح! 🎉\n\nهل حصلت مكالمة مع العميل دلوقتي؟ (أيوه / لأ)`,
        },
      ]);
    } catch (err) {
      console.error('saveLead error:', err);
      setLeadError('حصل مشكلة وأنا بحفظ العميل. جرّب تاني.');
    } finally {
      setLeadSaving(false);
    }
  }, [user, supabase, currentOrgId, profile]);

  const handlePostLeadInput = useCallback(async (text: string) => {
    const lo = text.trim().toLowerCase();

    if (postLeadStep === 'ask_call') {
      const isYes = ['أيوه','ايوه','آه','اه','نعم','yes','ايه','يه','اهه','اه','اه'].some(w => lo.includes(w));
      if (isYes) {
        setPostLeadData(prev => prev ? { ...prev, hadCall: true } : prev);
        setPostLeadStep('call_duration');
        setMessages(prev => [...prev, { role: 'assistant', content: 'تمام 📞 كام دقيقة كانت المكالمة تقريباً؟' }]);
      } else {
        setPostLeadData(prev => prev ? { ...prev, hadCall: false } : prev);
        const followUpDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const fmtDate = followUpDate.toLocaleString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        setPostLeadData(prev => prev ? { ...prev, followUpDate: followUpDate.toISOString() } : prev);
        setPostLeadStep('follow_up');
        setMessages(prev => [...prev, { role: 'assistant', content: `تمام!\nهنحدد فولو أب:\n📅 ${fmtDate}\n(خلال 48 ساعة)\n\nكويس؟ أو قولي وقت تاني.` }]);
      }
    } else if (postLeadStep === 'call_duration') {
      const mins = parseInt(text.replace(/[^\d]/g, '')) || 5;
      setPostLeadData(prev => prev ? { ...prev, callDuration: mins } : prev);
      setPostLeadStep('call_notes');
      setMessages(prev => [...prev, { role: 'assistant', content: 'وصف المكالمة إيه؟\nاكتب ملخص قصير عن اللي اتكلمتم فيه:' }]);
    } else if (postLeadStep === 'call_notes') {
      const followUpDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const fmtDate = followUpDate.toLocaleString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      setPostLeadData(prev => prev ? { ...prev, callNotes: text.trim(), followUpDate: followUpDate.toISOString() } : prev);
      setPostLeadStep('follow_up');
      setMessages(prev => [...prev, { role: 'assistant', content: `ممتاز ✅\nهنحدد فولو أب:\n📅 ${fmtDate}\n(خلال 48 ساعة)\n\nكويس؟ أو قولي وقت تاني.` }]);
    } else if (postLeadStep === 'follow_up') {
      // Try to parse DD/MM or DD/MM/YYYY from text
      const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
      if (dateMatch && !['تمام','ok','okay','ك','كويس'].includes(lo)) {
        try {
          const d = parseInt(dateMatch[1]), m = parseInt(dateMatch[2]);
          const y = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();
          const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
          const hr = timeMatch ? parseInt(timeMatch[1]) : 10;
          const mn = timeMatch ? parseInt(timeMatch[2]) : 0;
          const parsed = new Date(y, m - 1, d, hr, mn);
          if (!isNaN(parsed.getTime()) && parsed > new Date()) {
            setPostLeadData(prev => prev ? { ...prev, followUpDate: parsed.toISOString() } : prev);
          }
        } catch { /* use default 48h */ }
      }
      setPostLeadStep('ask_transfer');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'تمام! آخر حاجة — عايز تحول العميل لتيم معين؟',
        widget: 'team_select',
      }]);
    }
  }, [postLeadStep]);

  const handleTeamSelect = useCallback(async (team: string | null) => {
    if (!postLeadData?.leadId || !user) return;
    const teamDisplay = team === 'tech' ? 'Tech ⚙️' : team === 'cs' ? 'CS 🎧' : team === 'sales' ? 'Sales 💼' : 'لأ شكراً';
    setMessages(prev => [...prev, { role: 'user', content: teamDisplay }]);

    try {
      const updates: Record<string, unknown> = {};
      if (postLeadData.followUpDate) updates.next_follow_up = postLeadData.followUpDate;
      if (team) updates.assigned_to_team = team;
      if (Object.keys(updates).length > 0) {
        await supabase.from('leads').update(updates).eq('id', postLeadData.leadId);
      }

      if (postLeadData.hadCall) {
        await supabase.from('call_logs').insert({
          lead_id: postLeadData.leadId,
          created_by: user.id,
          org_id: currentOrgId,
          call_type: 'Outbound',
          outcome: 'Answered',
          duration_minutes: postLeadData.callDuration || 1,
          notes: postLeadData.callNotes || '',
        });
      }

      const followFmt = postLeadData.followUpDate
        ? new Date(postLeadData.followUpDate).toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' })
        : '';

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `تمام خالص! ✅\n${team ? `العميل اتحول لتيم ${teamDisplay}.` : 'العميل فضل في نفس الفريق.'}\n${followFmt ? `📅 الفولو أب: ${followFmt}` : ''}\n\nأي حاجة تانية؟ 😊`,
      }]);

      setPostLeadStep(null);
      setPostLeadData(null);
      loadPanels();
    } catch (err) {
      console.error('[handleTeamSelect]', err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'حصل مشكلة! جرب تاني.' }]);
    }
  }, [postLeadData, user, supabase, currentOrgId, loadPanels]);

  const handleCallFlowInput = useCallback(async (text: string) => {
    if (callFlowStep === 'ask_lead') {
      if (callFlowData?.leadMatches) {
        const idx = parseInt(text.replace(/[^\d]/g, '')) - 1;
        if (!isNaN(idx) && callFlowData.leadMatches[idx]) {
          const lead = callFlowData.leadMatches[idx];
          setCallFlowData(prev => ({ ...prev, leadId: lead.id, leadName: lead.name, leadMatches: undefined }));
          setCallFlowStep('ask_duration');
          setMessages(prev => [...prev, { role: 'assistant', content: `تمام! ${lead.name} ✅\n\nالمكالمة كانت كام دقيقة؟` }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: 'اكتب رقم صح من القايمة.' }]);
        }
        return;
      }
      const { data: found } = await supabase
        .from('leads')
        .select('id, name, phone')
        .ilike('name', `%${text.trim()}%`)
        .eq('org_id', currentOrgId)
        .limit(5);
      if (!found || found.length === 0) {
        setCallFlowStep(null);
        setCallFlowData(null);
        setMessages(prev => [...prev, { role: 'assistant', content: `مش لاقي عميل باسم "${text.trim()}". تأكد من الاسم وجرب تاني، أو سجّل عميل جديد.` }]);
        return;
      }
      if (found.length === 1) {
        setCallFlowData(prev => ({ ...prev, leadId: found[0].id, leadName: found[0].name }));
        setCallFlowStep('ask_duration');
        setMessages(prev => [...prev, { role: 'assistant', content: `لاقيت: ${found[0].name} (${found[0].phone || '—'}) ✅\n\nالمكالمة كانت كام دقيقة؟` }]);
      } else {
        const list = found.map((l, i) => `${i + 1}. ${l.name} (${l.phone || '—'})`).join('\n');
        setCallFlowData(prev => ({ ...prev, leadMatches: found as { id: string; name: string; phone: string | null }[] }));
        setMessages(prev => [...prev, { role: 'assistant', content: `لاقيت أكتر من واحد:\n${list}\n\nاكتب رقم العميل اللي تقصده:` }]);
      }
    } else if (callFlowStep === 'ask_duration') {
      const mins = parseInt(text.replace(/[^\d]/g, '')) || 1;
      setCallFlowData(prev => ({ ...prev, duration: mins }));
      setCallFlowStep('ask_description');
      setMessages(prev => [...prev, { role: 'assistant', content: 'وصف المكالمة إيه؟\nاكتب ملخص قصير عن اللي اتكلمتم فيه:' }]);
    } else if (callFlowStep === 'ask_description') {
      setCallFlowData(prev => ({ ...prev, description: text.trim() }));
      setCallFlowStep('ask_outcome');
      setMessages(prev => [...prev, { role: 'assistant', content: 'نتيجة المكالمة؟', widget: 'call_outcome' }]);
    }
  }, [callFlowStep, callFlowData, supabase, currentOrgId]);

  const handleCallOutcome = useCallback(async (outcome: string) => {
    if (!callFlowData?.leadId || !user) return;
    const outcomeLabelMap: Record<string, string> = {
      'Answered': 'تم الرد ✅',
      'No Answer': 'لم يرد ❌',
      'Busy': 'مشغول 🔄',
      'Callback Requested': 'طلب معاودة 📅',
    };
    setMessages(prev => [...prev, { role: 'user', content: outcomeLabelMap[outcome] || outcome }]);
    try {
      await supabase.from('call_logs').insert({
        lead_id: callFlowData.leadId,
        created_by: user.id,
        org_id: currentOrgId,
        call_type: 'Outbound',
        outcome,
        duration_minutes: callFlowData.duration || 1,
        notes: callFlowData.description || '',
      });
      await supabase.from('lead_activities').insert({
        lead_id: callFlowData.leadId,
        user_id: user.id,
        org_id: currentOrgId,
        type: 'call',
        body: `مكالمة - ${outcome} - ${callFlowData.duration || 1} دقيقة`,
        details: { outcome, duration_minutes: callFlowData.duration || 1 },
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `تمام ✅ المكالمة مع ${callFlowData.leadName} اتسجّلت!\n📞 ${outcomeLabelMap[outcome] || outcome} — ${callFlowData.duration || 1} دقيقة\n\nأي حاجة تانية؟`,
      }]);
      setCallFlowStep(null);
      setCallFlowData(null);
      loadPanels();
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'حصل مشكلة! جرب تاني.' }]);
    }
  }, [callFlowData, user, supabase, currentOrgId, loadPanels]);

  // Main send handler
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    // Standalone call log flow
    if (callFlowStep !== null && callFlowStep !== 'ask_outcome') {
      setMessages(prev => [...prev, { role: 'user', content: text }]);
      setInput('');
      await handleCallFlowInput(text);
      return;
    }

    // Post-lead flow (call summary / follow-up / team transfer)
    if (postLeadStep !== null && postLeadStep !== 'ask_transfer') {
      setMessages(prev => [...prev, { role: 'user', content: text }]);
      setInput('');
      await handlePostLeadInput(text);
      return;
    }

    // If we're in lead creation mode, treat this message as the answer to the current step
    if (leadFlowActive) {
      const currentField = LEAD_STEP_LABELS[leadStep].key;
      const validationError = validateStep(currentField, text);
      const userMsg: Msg = { role: 'user', content: text };
      setMessages(prev => [...prev, userMsg]);
      setInput('');

      if (validationError) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `⚠️ ${validationError}\n${LEAD_STEP_LABELS[leadStep].question}` },
        ]);
        return;
      }

      const normalizedValue =
        currentField === 'region' ? normalizeRegion(text) :
        currentField === 'source' ? normalizeSource(text) :
        text;
      const newDraft: LeadDraft = { ...leadDraft, [currentField]: normalizedValue };
      setLeadDraft(newDraft);

      const next = leadStep + 1;
      if (next >= LEAD_STEP_LABELS.length) {
        // All fields collected — save
        await saveLead(newDraft);
        return;
      }
      setLeadStep(next);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: LEAD_STEP_LABELS[next].question },
      ]);
      return;
    }

    // Normal chat message
    const userMsg: Msg = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setSending(true);

    const system = `أنت "هيليو"، المساعد الذكي لـ HelioMax (HVAC وتكييف).
تكلم بالعربية المصرية العامية. إجاباتك مفيدة وموجزة (3 جمل بحد أقصى).
اسم المستخدم: ${profile?.name ?? 'زميل'} | دوره: ${profile?.role ?? ''}.
لو المستخدم طلب تسجيل عميل جديد، رجّع JSON فقط: {"action":"register_lead_start","content":"..."} بدون كلام زيادة.`;

    const result = await callAgent(next, system);

    if (result.action === 'register_lead_start') {
      setLeadFlowActive(true);
      setLeadStep(0);
      setLeadDraft({});
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: result.content || result.nextQuestion || 'يلا نسجّل عميل جديد 📝' },
      ]);
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: result.content }]);
    }
    setSending(false);
  }, [input, sending, messages, profile, callAgent, leadFlowActive, leadStep, leadDraft, saveLead, callFlowStep, handleCallFlowInput, handlePostLeadInput, postLeadStep]);

  const cancelLeadFlow = () => {
    setLeadFlowActive(false);
    setLeadStep(0);
    setLeadDraft({});
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: 'تمام، ألغيت تسجيل العميل. ممكن نبدأ تاني في أي وقت 😊' },
    ]);
  };

  const startLeadFlow = () => {
    if (leadFlowActive) return;
    setLeadFlowActive(true);
    setLeadStep(0);
    setLeadDraft({});
    setMessages(prev => [
      ...prev,
      { role: 'user', content: 'سجّل عميل جديد' },
      { role: 'assistant', content: LEAD_STEP_LABELS[0].question },
    ]);
  };

  const startCallFlow = () => {
    if (callFlowStep !== null || leadFlowActive) return;
    setCallFlowStep('ask_lead');
    setCallFlowData({});
    setMessages(prev => [
      ...prev,
      { role: 'user', content: 'تسجيل مكالمة' },
      { role: 'assistant', content: '📞 تمام! اكتب اسم العميل اللي اتصلت بيه:' },
    ]);
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] font-sans text-slate-900" dir="rtl">
      <Navbar
        lang={lang}
        onToggleLang={toggleLang}
        collapsed={collapsed}
        onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      {/* 3-column layout — full height below navbar */}
      <main className="pt-16 min-h-screen">
        <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] w-full">
          {/* LEFT — Daily Report panel */}
          <aside className="w-full lg:w-[240px] xl:w-[260px] shrink-0 bg-white border-l border-slate-200 overflow-y-auto">
            <DailyReportPanel
              kpis={kpis}
              followUps={followUps}
              pendingTasks={pendingTasks}
              loading={panelsLoading}
              onSeeAllFollowUps={() => router.push('/my-leads')}
            />
          </aside>

          {/* CENTER — AI chat (or nested page like /my-leads) */}
          <section className="flex-1 min-w-0 flex flex-col bg-[#0D2137] relative overflow-hidden">
            {showMyReport && !isFullPageRoute ? (
              <div className="flex-1 overflow-y-auto bg-[#F4F6F8]">
                <InlineMyReport
                  profile={profile}
                  kpis={kpis}
                  followUps={followUps}
                  pendingTasks={pendingTasks}
                  recentBoqs={recentBoqs}
                  leadsToday={leadsToday}
                  callsTodayDetails={callsTodayDetails}
                  loading={panelsLoading}
                  onClose={() => setShowMyReport(false)}
                />
              </div>
            ) : isFullPageRoute ? (
              <div className="flex-1 overflow-y-auto bg-[#F4F6F8]">
                <div className="p-4 md:p-6 max-w-4xl mx-auto">
                  <button
                    onClick={() => router.back()}
                    className="mb-3 text-xs text-slate-500 hover:text-slate-800"
                  >
                    ← رجوع
                  </button>
                  {children}
                </div>
              </div>
            ) : (
              <>
                <ChatHeader
                  onStartLeadFlow={startLeadFlow}
                  leadFlowActive={leadFlowActive}
                  onStartCallFlow={startCallFlow}
                  callFlowActive={callFlowStep !== null}
                  onLogout={handleLogout}
                />

                {leadFlowActive && (
                  <LeadFlowBanner
                    step={leadStep}
                    totalSteps={LEAD_STEP_LABELS.length}
                    draft={leadDraft}
                    onCancel={cancelLeadFlow}
                  />
                )}

                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1a3a5c transparent' }}>
                  {messages.map((m, i) => (
                    <ChatBubble
                      key={i}
                      role={m.role}
                      content={m.content}
                      widget={m.widget}
                      onTeamSelect={
                        m.widget === 'team_select' && postLeadStep === 'ask_transfer'
                          ? handleTeamSelect
                          : undefined
                      }
                      onCallOutcome={
                        m.widget === 'call_outcome' && callFlowStep === 'ask_outcome'
                          ? handleCallOutcome
                          : undefined
                      }
                    />
                  ))}
                  {sending && <TypingDots />}
                </div>

                {postLeadStep !== 'ask_transfer' && callFlowStep !== 'ask_outcome' && (
                  <ChatInput
                    value={input}
                    onChange={setInput}
                    onSend={handleSend}
                    sending={sending}
                    placeholder={
                      callFlowStep === 'ask_lead' ? 'اسم العميل...' :
                      callFlowStep === 'ask_duration' ? 'عدد الدقائق (مثلاً: 10)' :
                      callFlowStep === 'ask_description' ? 'وصف المكالمة...' :
                      postLeadStep === 'ask_call' ? 'أيوه / لأ' :
                      postLeadStep === 'call_duration' ? 'عدد الدقائق (مثلاً: 10)' :
                      postLeadStep === 'call_notes' ? 'وصف المكالمة...' :
                      postLeadStep === 'follow_up' ? 'تمام / أو اكتب التاريخ DD/MM...' :
                      leadFlowActive
                        ? LEAD_STEP_LABELS[leadStep].placeholder || LEAD_STEP_LABELS[leadStep].question
                        : 'اكتب سؤالك هنا…'
                    }
                  />
                )}
              </>
            )}
          </section>

          {/* RIGHT — BOQ / My Quotes panel */}
          <aside className="w-full lg:w-[240px] xl:w-[260px] shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
            <BOQPanel
              boqs={recentBoqs}
              loading={panelsLoading}
              kpis={kpis}
              onNewBoq={() => router.push('/boq/new')}
              onOpenBoq={(id) => router.push(`/boq/${id}`)}
              onOpenMyLeads={() => router.push('/my-leads')}
              onOpenReports={() => setShowMyReport(true)}
              onOpenTasks={() => router.push('/tasks')}
            />
          </aside>
        </div>
      </main>

      {leadSaving && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl px-6 py-4 flex items-center gap-3 shadow-2xl">
            <div className="w-5 h-5 border-2 border-[#D72B2B] border-t-transparent rounded-full animate-spin" />
            <span className="font-semibold text-slate-800">جاري تسجيل العميل…</span>
          </div>
        </div>
      )}

      {leadError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {leadError}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DailyReportPanel({ kpis, followUps, pendingTasks, loading, onSeeAllFollowUps }: {
  kpis: { myLeads: number; myBOQs: number; callsToday: number; tasksOpen: number };
  followUps: { id: string; name: string; next_follow_up: string | null }[];
  pendingTasks: { id: string; title: string; due_date: string | null }[];
  loading: boolean;
  onSeeAllFollowUps: () => void;
}) {
  const today = new Date();
  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-[#0D2137] flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#D72B2B]" />
          تقرير اليوم
        </h3>
        <p className="text-xs text-slate-500 mt-1">{formatDate(today.toISOString())}</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <KpiCard icon={<UserCircle2 className="w-4 h-4" />} label="عملائي" value={kpis.myLeads} color="#0D2137" />
            <KpiCard icon={<FileText className="w-4 h-4" />} label="عروضي" value={kpis.myBOQs} color="#D72B2B" />
            <KpiCard icon={<Phone className="w-4 h-4" />} label="مكالمات اليوم" value={kpis.callsToday} color="#52C41A" />
            <KpiCard icon={<ListChecks className="w-4 h-4" />} label="مهام مفتوحة" value={kpis.tasksOpen} color="#FAAD14" />
          </div>

          <div>
            <div className="flex items-center justify-between mt-2 mb-2">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                المتابعات القادمة
              </h4>
              <button
                onClick={onSeeAllFollowUps}
                className="text-[10px] text-[#D72B2B] hover:underline flex items-center gap-0.5 font-medium"
              >
                رؤية الكل
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {followUps.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 text-center">لا يوجد متابعات مجدولة</p>
            ) : (
              <ul className="space-y-1.5">
                {followUps.map(f => (
                  <li key={f.id} className="text-xs bg-slate-50 rounded-md px-2 py-1.5 flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    {f.next_follow_up && <span className="text-slate-500 shrink-0">{formatDate(f.next_follow_up)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mt-2 mb-2">
              <ListChecks className="w-3.5 h-3.5" />
              المهام المعلقة
            </h4>
            {pendingTasks.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 text-center">لا توجد مهام معلقة 🎉</p>
            ) : (
              <ul className="space-y-1.5">
                {pendingTasks.map(t => (
                  <li key={t.id} className="text-xs bg-amber-50 rounded-md px-2 py-1.5 flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="truncate flex-1">{t.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-800 leading-none">{value}</div>
    </div>
  );
}

function BOQPanel({ boqs, loading, kpis, onNewBoq, onOpenBoq, onOpenMyLeads, onOpenReports, onOpenTasks }: {
  boqs: { id: string; boq_number: string; customer_name: string | null; grand_total: number; status: string; created_at: string }[];
  loading: boolean;
  kpis: { myLeads: number; myBOQs: number; callsToday: number; tasksOpen: number };
  onNewBoq: () => void;
  onOpenBoq: (id: string) => void;
  onOpenMyLeads: () => void;
  onOpenReports: () => void;
  onOpenTasks: () => void;
}) {
  const statusColor: Record<string, string> = {
    Draft: 'bg-slate-100 text-slate-700',
    Sent: 'bg-blue-100 text-blue-700',
    Paid: 'bg-green-100 text-green-700',
    Cancelled: 'bg-red-100 text-red-700',
  };

  const now = new Date();
  const isReportTime = now.getHours() > 15 || (now.getHours() === 15 && now.getMinutes() >= 30);
  const [reportOpen, setReportOpen] = useState(isReportTime);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#0D2137] flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#D72B2B]" />
          عروضي (My Quotes)
        </h3>
      </div>

      <button
        onClick={onNewBoq}
        className="w-full flex items-center justify-center gap-2 bg-[#D72B2B] hover:bg-[#b82222] text-white text-sm font-semibold py-2.5 rounded-lg transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" />
        عرض سعر جديد (New BOQ)
      </button>

      <button
        onClick={onOpenMyLeads}
        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold py-2 rounded-lg transition-colors"
      >
        <UserCircle2 className="w-4 h-4" />
        عملائي (My Leads)
      </button>

      {/* My Report — inline, time-gated to 3:30 PM */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setReportOpen(p => !p)}
          className="w-full flex items-center justify-between gap-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold px-3 py-2 transition-colors"
        >
          <span className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-600" />
            تقريري اليومي
          </span>
          {isReportTime ? (
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">جاهز</span>
          ) : (
            <span className="text-[10px] text-slate-400">3:30 م</span>
          )}
        </button>
        {reportOpen && (
          <div className="border-t border-slate-100 bg-slate-50 p-3">
            {isReportTime ? (
              <>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {[
                    { label: 'عملائي', value: kpis.myLeads, color: '#0D2137' },
                    { label: 'عروضي', value: kpis.myBOQs, color: '#D72B2B' },
                    { label: 'مكالمات', value: kpis.callsToday, color: '#52C41A' },
                    { label: 'مهام', value: kpis.tasksOpen, color: '#FAAD14' },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-md p-2 border border-slate-100 text-center">
                      <div className="text-[10px] text-slate-500">{s.label}</div>
                      <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <button onClick={onOpenReports} className="text-[10px] text-[#D72B2B] hover:underline flex items-center gap-0.5">
                  التقرير الكامل <ChevronRight className="w-3 h-3" />
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-500 text-center py-1">🔒 التقرير متاح الساعة 3:30 م</p>
            )}
          </div>
        )}
      </div>

      <button
        onClick={onOpenTasks}
        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold py-2 rounded-lg transition-colors"
      >
        <CheckSquare className="w-4 h-4 text-amber-500" />
        مهامي اليومية (Daily Tasks)
      </button>

      <div className="border-t border-slate-100 pt-2">
        <h4 className="text-xs font-bold text-slate-700 mb-2">آخر العروض</h4>
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-50 rounded animate-pulse" />)}
          </div>
        ) : boqs.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">مفيش عروض لسه</p>
        ) : (
          <ul className="space-y-1.5">
            {boqs.map(b => (
              <li key={b.id}>
                <button
                  onClick={() => onOpenBoq(b.id)}
                  className="w-full text-right bg-slate-50 hover:bg-slate-100 rounded-md px-2.5 py-2 transition-colors"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-slate-800 truncate">{b.customer_name || b.boq_number}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColor[b.status] || statusColor.Draft}`}>{b.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{b.boq_number}</span>
                    <span>${Number(b.grand_total || 0).toLocaleString()}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChatHeader({ onStartLeadFlow, leadFlowActive, onStartCallFlow, callFlowActive, onLogout }: {
  userName?: string | null;
  onStartLeadFlow: () => void;
  leadFlowActive: boolean;
  onStartCallFlow: () => void;
  callFlowActive: boolean;
  onLogout?: () => void;
}) {
  const busy = leadFlowActive || callFlowActive;
  return (
    <div className="bg-gradient-to-l from-[#D72B2B] to-[#a01f1f] px-4 py-3 flex items-center justify-between border-b border-white/10">
      <div className="flex items-center gap-3">
        <div className="rounded-full border-2 border-[#F5A623] overflow-hidden">
          <HelioAvatar size={40} />
        </div>
        <div>
          <div className="text-white font-bold text-sm">هيليو — المساعد الذكي</div>
          <div className="text-white/70 text-[11px]">HELIOMAX</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onStartLeadFlow}
          disabled={busy}
          className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          سجّل عميل
        </button>
        <button
          onClick={onStartCallFlow}
          disabled={busy}
          className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
        >
          <Phone className="w-3.5 h-3.5" />
          سجّل مكالمة
        </button>
        <NotificationBell />
        {onLogout && (
          <button onClick={onLogout} title="تسجيل الخروج" className="flex items-center gap-1.5 bg-white/10 hover:bg-white/25 text-white text-xs font-semibold px-2 py-1.5 rounded-md transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ role, content, widget, onTeamSelect, onCallOutcome }: {
  role: 'user' | 'assistant';
  content: string;
  widget?: 'team_select' | 'call_outcome';
  onTeamSelect?: (team: string | null) => void;
  onCallOutcome?: (outcome: string) => void;
}) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} gap-2`}>
      {!isUser && (
        <div className="shrink-0 mt-1">
          <HelioAvatar size={28} />
        </div>
      )}
      <div className="max-w-[80%] space-y-2">
        {content && (
          <div
            className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
              isUser
                ? 'bg-[#D72B2B] text-white rounded-tr-sm'
                : 'bg-[#1a3a5c] text-white rounded-tl-sm'
            }`}
            dir="rtl"
          >
            {content}
          </div>
        )}
        {widget === 'team_select' && onTeamSelect && (
          <div className="flex flex-wrap gap-2 justify-end">
            {([
              { key: 'tech',  label: '⚙️ Tech' },
              { key: 'cs',    label: '🎧 CS' },
              { key: 'sales', label: '💼 Sales' },
              { key: null,    label: '🚫 لأ شكراً' },
            ] as { key: string | null; label: string }[]).map(t => (
              <button
                key={String(t.key)}
                onClick={() => onTeamSelect(t.key)}
                className="bg-[#D72B2B]/20 hover:bg-[#D72B2B]/50 border border-[#D72B2B]/40 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors active:scale-95"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {widget === 'call_outcome' && onCallOutcome && (
          <div className="flex flex-wrap gap-2 justify-end">
            {[
              { key: 'Answered',           label: '✅ تم الرد' },
              { key: 'No Answer',          label: '❌ لم يرد' },
              { key: 'Busy',               label: '🔄 مشغول' },
              { key: 'Callback Requested', label: '📅 طلب معاودة' },
            ].map(o => (
              <button
                key={o.key}
                onClick={() => onCallOutcome(o.key)}
                className="bg-[#D72B2B]/20 hover:bg-[#D72B2B]/50 border border-[#D72B2B]/40 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors active:scale-95"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex justify-end gap-2">
      <div className="shrink-0 mt-1">
        <HelioAvatar size={28} />
      </div>
      <div className="bg-[#1a3a5c] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-[#F5A623] animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-[#F5A623] animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-[#F5A623] animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

function ChatInput({ value, onChange, onSend, sending, placeholder }: {
  value: string; onChange: (v: string) => void; onSend: () => void; sending: boolean; placeholder: string;
}) {
  return (
    <div className="border-t border-[#1a3a5c] bg-[#0a1929] p-3 flex items-center gap-2">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !sending && value.trim()) onSend(); }}
        placeholder={placeholder}
        disabled={sending}
        className="flex-1 bg-[#1a3a5c] border border-[#2a4a6c] focus:border-[#F5A623] rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors placeholder-white/40"
        dir="rtl"
      />
      <button
        onClick={onSend}
        disabled={sending || !value.trim()}
        className="bg-[#F5A623] disabled:bg-[#1a3a5c] disabled:text-white/40 hover:bg-[#e09515] text-[#0D2137] rounded-lg p-2.5 transition-colors disabled:cursor-not-allowed"
        aria-label="إرسال"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}

function InlineMyReport({ profile, kpis, followUps, pendingTasks, recentBoqs, leadsToday, callsTodayDetails, loading, onClose }: {
  profile: import('@/types').Profile | null | undefined;
  kpis: { myLeads: number; myBOQs: number; callsToday: number; tasksOpen: number };
  followUps: { id: string; name: string; next_follow_up: string | null }[];
  pendingTasks: { id: string; title: string; due_date: string | null }[];
  recentBoqs: { id: string; boq_number: string; customer_name: string | null; grand_total: number; status: string; created_at: string }[];
  leadsToday: { id: string; name: string; phone: string | null; source: string | null; status: string | null }[];
  callsTodayDetails: { id: string; outcome: string | null; duration_minutes: number | null; notes: string | null; lead_name: string | null }[];
  loading: boolean;
  onClose: () => void;
}) {
  const today = new Date();
  const [reportDescription, setReportDescription] = useState('');
  const statusColor: Record<string, string> = {
    Draft: 'bg-slate-100 text-slate-700',
    Sent: 'bg-blue-100 text-blue-700',
    Paid: 'bg-green-100 text-green-700',
    Cancelled: 'bg-red-100 text-red-700',
  };

  const handleDownloadPDF = () => {
    const todayStr = today.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const descHtml = reportDescription.trim()
      ? `<div class="desc">${reportDescription.trim().replace(/\n/g, '<br/>')}</div>`
      : '';
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>تقريري اليومي — ${profile?.name}</title>
<style>
  body{font-family:Arial,sans-serif;direction:rtl;padding:32px;color:#1e293b;background:#fff}
  h1{color:#0D2137;font-size:20px;margin:0 0 4px}
  .sub{color:#64748b;font-size:12px;margin-bottom:12px}
  .desc{background:#f8fafc;border-right:3px solid #D72B2B;padding:10px 14px;margin-bottom:20px;font-size:13px;line-height:1.6;color:#334155;border-radius:4px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .kpi{border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}
  .kv{font-size:28px;font-weight:700}
  .kl{font-size:11px;color:#64748b;margin-top:4px}
  .sec{border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px}
  .sec h2{font-size:14px;font-weight:700;margin:0 0 12px;color:#0D2137}
  .row{display:flex;justify-content:space-between;padding:8px 12px;background:#f8fafc;border-radius:6px;margin-bottom:6px;font-size:13px}
  .empty{text-align:center;color:#94a3b8;font-size:12px;padding:12px 0}
  .badge{font-size:10px;padding:2px 8px;border-radius:12px;background:#e2e8f0;color:#475569}
  @media print{body{padding:16px}}
</style>
</head>
<body>
<h1>📊 تقريري اليومي</h1>
<div class="sub">${profile?.name ?? ''} · ${todayStr}</div>
${descHtml}
<div class="kpis">
  <div class="kpi"><div class="kv" style="color:#0D2137">${kpis.myLeads}</div><div class="kl">عملائي</div></div>
  <div class="kpi"><div class="kv" style="color:#D72B2B">${kpis.myBOQs}</div><div class="kl">عروضي</div></div>
  <div class="kpi"><div class="kv" style="color:#16a34a">${kpis.callsToday}</div><div class="kl">مكالمات اليوم</div></div>
  <div class="kpi"><div class="kv" style="color:#d97706">${kpis.tasksOpen}</div><div class="kl">مهام مفتوحة</div></div>
</div>
<div class="sec"><h2>👥 العملاء المسجلون اليوم (${leadsToday.length})</h2>${
  leadsToday.length === 0
    ? '<div class="empty">لم يتم تسجيل عملاء اليوم</div>'
    : leadsToday.map(l => `<div class="row"><div><div style="font-weight:600">${l.name}</div><small style="color:#64748b">${l.phone || ''} · ${l.source || ''}</small></div><span class="badge">${l.status || ''}</span></div>`).join('')
}</div>
<div class="sec"><h2>📞 مكالمات اليوم (${callsTodayDetails.length})</h2>${
  callsTodayDetails.length === 0
    ? '<div class="empty">لا توجد مكالمات اليوم</div>'
    : callsTodayDetails.map(c => `<div class="row"><div><div style="font-weight:600">${c.lead_name || '—'}</div><small style="color:#64748b">${c.notes || ''}</small></div><div style="text-align:left"><div>${c.outcome || ''}</div><small style="color:#64748b">${c.duration_minutes ? c.duration_minutes + ' دقيقة' : ''}</small></div></div>`).join('')
}</div>
<div class="sec"><h2>📅 المتابعات القادمة</h2>${
  followUps.length === 0
    ? '<div class="empty">لا يوجد متابعات مجدولة</div>'
    : followUps.map(f => `<div class="row"><span>${f.name}</span><span style="color:#64748b">${f.next_follow_up ? new Date(f.next_follow_up).toLocaleDateString('ar-EG') : ''}</span></div>`).join('')
}</div>
<div class="sec"><h2>✅ المهام المعلقة</h2>${
  pendingTasks.length === 0
    ? '<div class="empty">لا توجد مهام معلقة 🎉</div>'
    : pendingTasks.map(t => `<div class="row"><span>${t.title}</span><span style="color:#64748b">${t.due_date ? new Date(t.due_date).toLocaleDateString('ar-EG') : ''}</span></div>`).join('')
}</div>
<div class="sec"><h2>📄 آخر عروض الأسعار</h2>${
  recentBoqs.length === 0
    ? '<div class="empty">مفيش عروض لسه</div>'
    : recentBoqs.map(b => `<div class="row"><div><div>${b.customer_name || b.boq_number}</div><small style="color:#64748b">${b.boq_number}</small></div><div style="display:flex;gap:8px;align-items:center"><span class="badge">${b.status}</span><strong>$${Number(b.grand_total||0).toLocaleString()}</strong></div></div>`).join('')
}</div>
<script>window.onload=()=>{window.print()}<\/script>
</body></html>`);
    win.document.close();
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-[#0D2137] flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-[#D72B2B]" />
            تقريري اليومي
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {profile?.name} · {formatDate(today.toISOString())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 bg-[#0D2137] hover:bg-[#1a3a5c] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            تحميل PDF
          </button>
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
          >
            <X className="w-4 h-4" /> إغلاق
          </button>
        </div>
      </div>

      {/* Report description input */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-slate-600 mb-1">وصف / ملاحظات التقرير (اختياري)</label>
        <textarea
          value={reportDescription}
          onChange={e => setReportDescription(e.target.value)}
          rows={2}
          placeholder="أضف ملاحظة أو ملخص يظهر في التقرير المُصدَّر..."
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#D72B2B]/30 text-slate-700"
          dir="rtl"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'عملائي', value: kpis.myLeads, color: '#0D2137', icon: <UserCircle2 className="w-5 h-5" /> },
              { label: 'عروضي', value: kpis.myBOQs, color: '#D72B2B', icon: <FileText className="w-5 h-5" /> },
              { label: 'مكالمات اليوم', value: kpis.callsToday, color: '#52C41A', icon: <Phone className="w-5 h-5" /> },
              { label: 'مهام مفتوحة', value: kpis.tasksOpen, color: '#FAAD14', icon: <ListChecks className="w-5 h-5" /> },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
                <div className="flex justify-center mb-1" style={{ color: s.color }}>{s.icon}</div>
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Today's leads */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <UserCircle2 className="w-4 h-4 text-[#0D2137]" />
              العملاء المسجلون اليوم
              <span className="ml-auto bg-[#0D2137] text-white text-[10px] px-2 py-0.5 rounded-full">{leadsToday.length}</span>
            </h4>
            {leadsToday.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">لم يتم تسجيل عملاء اليوم</p>
            ) : (
              <ul className="space-y-2">
                {leadsToday.map(l => (
                  <li key={l.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <div>
                      <div className="font-medium text-slate-800">{l.name}</div>
                      <div className="text-xs text-slate-500">{l.phone || ''}{l.source ? ` · ${l.source}` : ''}</div>
                    </div>
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{l.status || ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Today's calls */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <Phone className="w-4 h-4 text-green-600" />
              مكالمات اليوم
              <span className="ml-auto bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full">{callsTodayDetails.length}</span>
            </h4>
            {callsTodayDetails.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">لا توجد مكالمات اليوم</p>
            ) : (
              <ul className="space-y-2">
                {callsTodayDetails.map(c => (
                  <li key={c.id} className="flex items-center justify-between text-sm bg-green-50 rounded-lg px-3 py-2">
                    <div>
                      <div className="font-medium text-slate-800">{c.lead_name || '—'}</div>
                      {c.notes && <div className="text-xs text-slate-500 truncate max-w-[200px]">{c.notes}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-slate-700">{c.outcome || ''}</div>
                      {c.duration_minutes && <div className="text-xs text-slate-500">{c.duration_minutes} دقيقة</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Follow-ups */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-blue-500" />
              المتابعات القادمة
            </h4>
            {followUps.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">لا يوجد متابعات مجدولة</p>
            ) : (
              <ul className="space-y-2">
                {followUps.map(f => (
                  <li key={f.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <span className="font-medium text-slate-800">{f.name}</span>
                    {f.next_follow_up && <span className="text-xs text-slate-500">{formatDate(f.next_follow_up)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pending tasks */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-amber-500" />
              المهام المعلقة
            </h4>
            {pendingTasks.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">لا توجد مهام معلقة 🎉</p>
            ) : (
              <ul className="space-y-2">
                {pendingTasks.map(t => (
                  <li key={t.id} className="flex items-center justify-between text-sm bg-amber-50 rounded-lg px-3 py-2">
                    <span className="font-medium text-slate-800">{t.title}</span>
                    {t.due_date && <span className="text-xs text-slate-500">{formatDate(t.due_date)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent BOQs */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-[#D72B2B]" />
              آخر عروض الأسعار
            </h4>
            {recentBoqs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">مفيش عروض لسه</p>
            ) : (
              <ul className="space-y-2">
                {recentBoqs.map(b => (
                  <li key={b.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <div>
                      <div className="font-medium text-slate-800">{b.customer_name || b.boq_number}</div>
                      <div className="text-xs text-slate-500">{b.boq_number}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor[b.status] || statusColor.Draft}`}>{b.status}</span>
                      <span className="text-xs font-bold text-slate-700">${Number(b.grand_total || 0).toLocaleString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LeadFlowBanner({ step, totalSteps, draft, onCancel }: {
  step: number; totalSteps: number; draft: LeadDraft; onCancel: () => void;
}) {
  const progress = ((step) / totalSteps) * 100;
  return (
    <div className="bg-[#F5A623]/15 border-b border-[#F5A623]/30 px-4 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-white text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-[#F5A623]" />
          تسجيل عميل جديد — خطوة {Math.min(step + 1, totalSteps)} من {totalSteps}
        </div>
        <button
          onClick={onCancel}
          className="text-white/60 hover:text-white text-xs flex items-center gap-1"
        >
          <X className="w-3 h-3" /> إلغاء
        </button>
      </div>
      <div className="w-full bg-white/10 rounded-full h-1.5 mb-1.5 overflow-hidden">
        <div className="bg-[#F5A623] h-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex flex-wrap gap-1">
        {(['name','phone','region','project_type','source','budget_range'] as (keyof LeadDraft)[]).map((k, i) => {
          const filled = draft[k] != null && draft[k] !== '';
          const active = i === step;
          return (
            <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded ${
              filled ? 'bg-[#52C41A]/30 text-green-200' :
              active ? 'bg-[#F5A623]/40 text-amber-100' :
              'bg-white/5 text-white/40'
            }`}>
              {filled ? '✓' : active ? '●' : '○'} {LEAD_STEP_LABELS[i]?.question.split('?')[0] || k}
            </span>
          );
        })}
      </div>
    </div>
  );
}
