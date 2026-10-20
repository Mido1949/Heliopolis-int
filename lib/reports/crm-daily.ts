import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PIPELINE_STAGES } from '@/lib/constants';

/**
 * Daily CRM email for management (Mr. Ali, Mr. Ehab) — today's work only, Cairo day.
 * Page 1 is the decisions that need a conversation or an approval; the rest is
 * the evidence behind them. Pure data + HTML; sending lives in the cron route.
 */

type Profile = { id: string; name: string | null; role: string | null; country: string | null };
type Lead = {
  id: string; name: string | null; country: string | null; pipeline_stage: string | null;
  assigned_to: string | null; assigned_to_user: string | null; created_at: string;
  updated_at: string | null; source: string | null; lost_reason: string | null;
  stage_timestamps: Record<string, string> | null;
};
type Msg = {
  lead_id: string | null; customer_phone: string | null; direction: string; origin: string;
  sent_by: string | null; sent_at: string; country: string | null; is_bot: boolean | null;
};

export interface Decision { title: string; why: string; ask: string }

export interface CrmDailyReport {
  date: string;
  decisions: Decision[];
  summary: { label: string; value: number }[];
  team: { name: string; openLeads: number; leadsMessaged: number; messages: number; activities: number; tasksDone: number; overdue: number }[];
  pipeline: { label: string; eg: number; sa: number }[];
  unanswered: { name: string; owner: string; waitingHours: number }[];
  staleNegotiation: { name: string; owner: string; days: number }[];
  html: string;
  subject: string;
}

// Cairo midnight for the given Cairo date, as a UTC instant (DST-safe).
function cairoDayStart(dateISO: string): Date {
  const noon = new Date(`${dateISO}T12:00:00Z`);
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', timeZoneName: 'shortOffset' })
    .formatToParts(noon).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+2';
  const offsetH = Number(tz.replace('GMT', '') || 0);
  return new Date(Date.parse(`${dateISO}T00:00:00Z`) - offsetH * 3600_000);
}

// PostgREST caps a response at 1000 rows; page through anything that can grow.
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const OPEN = ['NEW', 'QUOTED', 'NEGOTIATION'];

export async function generateCrmDailyReport(dateISO: string, client?: SupabaseClient): Promise<CrmDailyReport> {
  const supabase = client ?? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const start = cairoDayStart(dateISO);
  const startISO = start.toISOString();
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86400_000).toISOString();

  const [profiles, leads, weekMsgs, acts, tasksOpen, tasksDone, boqs, quoteFiles] = await Promise.all([
    all<Profile>((a, b) => supabase.from('profiles').select('id, name, role, country').range(a, b)),
    all<Lead>((a, b) => supabase.from('leads')
      .select('id, name, country, pipeline_stage, assigned_to, assigned_to_user, created_at, updated_at, source, lost_reason, stage_timestamps')
      .range(a, b)),
    all<Msg>((a, b) => supabase.from('wa_messages')
      .select('lead_id, customer_phone, direction, origin, sent_by, sent_at, country, is_bot')
      .neq('origin', 'history').gte('sent_at', weekAgo).order('sent_at', { ascending: true }).range(a, b)),
    all<{ user_id: string | null; type: string }>((a, b) => supabase.from('lead_activities')
      .select('user_id, type').gte('created_at', startISO).range(a, b)),
    all<{ assigned_to: string | null; due_date: string | null }>((a, b) => supabase.from('tasks')
      .select('assigned_to, due_date').eq('status', 'pending').lt('due_date', new Date(now).toISOString()).range(a, b)),
    all<{ assigned_to: string | null }>((a, b) => supabase.from('tasks')
      .select('assigned_to').gte('completed_at', startISO).range(a, b)),
    all<{ id: string; country: string | null }>((a, b) => supabase.from('boqs')
      .select('id, country').gte('created_at', startISO).range(a, b)),
    all<{ id: string }>((a, b) => supabase.from('client_files')
      .select('id').eq('category', 'quote').gte('created_at', startISO).range(a, b)),
  ]);

  const nameOf = new Map(profiles.map((p) => [p.id, p.name || '—']));
  const owner = (l: Lead) => l.assigned_to_user || l.assigned_to;
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const eg = leads.filter((l) => (l.country || 'EG') === 'EG');
  const egOpen = eg.filter((l) => OPEN.includes(l.pipeline_stage || 'NEW'));
  const todayMsgs = weekMsgs.filter((m) => m.sent_at >= startISO && (m.country || 'EG') === 'EG');

  // ── Summary
  const newToday = eg.filter((l) => l.created_at >= startISO);
  const customersWrote = new Set(todayMsgs.filter((m) => m.direction === 'in').map((m) => m.customer_phone)).size;
  const sentCrm = todayMsgs.filter((m) => m.direction === 'out' && m.origin === 'api' && !m.is_bot).length;
  const sentPhone = todayMsgs.filter((m) => m.direction === 'out' && m.origin === 'app').length;
  const stageAt = (l: Lead, s: string) => l.stage_timestamps?.[s] ?? null;
  const wonToday = eg.filter((l) => l.pipeline_stage === 'WON' && (stageAt(l, 'WON') ?? '') >= startISO);
  const lostToday = eg.filter((l) => l.pipeline_stage === 'LOST' && (l.updated_at ?? '') >= startISO
    && !(l.lost_reason || '').startsWith('أرشيف قديم'));
  const quotedToday = eg.filter((l) => (stageAt(l, 'QUOTED') ?? '') >= startISO);

  const summary = [
    { label: 'عملاء جدد دخلوا', value: newToday.length },
    { label: 'عملاء كتبوا على واتساب', value: customersWrote },
    { label: 'رسائل اتبعتت من الـ CRM', value: sentCrm },
    { label: 'رسائل اتبعتت من موبايلات الشركة', value: sentPhone },
    { label: 'عروض أسعار (مقايسات) اترفعت', value: Math.max(boqs.filter((b) => (b.country || 'EG') === 'EG').length + quoteFiles.length, quotedToday.length) },
    { label: 'صفقات اتقفلت (مكسب)', value: wonToday.length },
    { label: 'عملاء اتقفلوا خسارة', value: lostToday.length },
  ];

  // ── Team (reps only; skip people with nothing on their plate)
  const team = profiles
    .filter((p) => (p.country || 'EG') === 'EG')
    .map((p) => {
      const mine = todayMsgs.filter((m) => m.direction === 'out' && m.sent_by === p.id);
      return {
        name: p.name || '—',
        openLeads: egOpen.filter((l) => owner(l) === p.id).length,
        leadsMessaged: new Set(mine.map((m) => m.lead_id)).size,
        messages: mine.length,
        activities: acts.filter((a) => a.user_id === p.id).length,
        tasksDone: tasksDone.filter((t) => t.assigned_to === p.id).length,
        overdue: tasksOpen.filter((t) => t.assigned_to === p.id).length,
      };
    })
    .filter((r) => r.openLeads + r.messages + r.activities + r.tasksDone + r.overdue > 0)
    .sort((a, b) => b.openLeads - a.openLeads || b.messages - a.messages);

  // ── Pipeline (lifetime snapshot)
  const pipeline = PIPELINE_STAGES.map((s) => ({
    label: s.labelAr,
    eg: leads.filter((l) => (l.country || 'EG') === 'EG' && (l.pipeline_stage || 'NEW') === s.value).length,
    sa: leads.filter((l) => l.country === 'SA' && (l.pipeline_stage || 'NEW') === s.value).length,
  }));

  // ── Customers waiting on us: last message in the thread is theirs, > 1h old
  const lastByPhone = new Map<string, Msg>();
  for (const m of weekMsgs) if (m.customer_phone && (m.country || 'EG') === 'EG') lastByPhone.set(m.customer_phone, m);
  const unanswered = Array.from(lastByPhone.values())
    .filter((m) => m.direction === 'in' && now - Date.parse(m.sent_at) > 3600_000)
    .map((m) => {
      const l = m.lead_id ? leadById.get(m.lead_id) : undefined;
      return {
        name: l?.name || m.customer_phone || '—',
        owner: l && owner(l) ? nameOf.get(owner(l)!) || '—' : 'مش متوزع',
        waitingHours: Math.round((now - Date.parse(m.sent_at)) / 3600_000),
      };
    })
    .sort((a, b) => a.waitingHours - b.waitingHours);

  const staleNegotiation = eg
    .filter((l) => l.pipeline_stage === 'NEGOTIATION' && now - Date.parse(l.updated_at || l.created_at) > 7 * 86400_000)
    .map((l) => ({
      name: l.name || '—',
      owner: owner(l) ? nameOf.get(owner(l)!) || '—' : 'مش متوزع',
      days: Math.floor((now - Date.parse(l.updated_at || l.created_at)) / 86400_000),
    }))
    .sort((a, b) => b.days - a.days);

  // ── Decisions: each one is something only management can settle
  const decisions: Decision[] = [];
  const unassigned = egOpen.filter((l) => !owner(l)).length;
  if (unassigned > 0) decisions.push({
    title: `${unassigned} عميل مفتوح مش متوزع على حد`,
    why: 'العميل اللي مالوش مسؤول مابيتابعش، وبيبرد مع الوقت.',
    ask: 'مين يستلمهم؟ ولا نعتمد توزيع تلقائي على الفريق؟',
  });
  const idle = team.filter((t) => t.openLeads >= 10 && t.messages === 0);
  if (idle.length > 0) decisions.push({
    title: `${idle.reduce((n, t) => n + t.openLeads, 0)} عميل مفتوح عند موظفين مابعتوش ولا رسالة من الـ CRM النهارده`,
    why: `${idle.map((t) => `${t.name} (${t.openLeads})`).join('، ')}. ممكن الشغل ماشي من موبايل الشركة، أو العملاء دول واقفين فعلاً.`,
    ask: 'نسأل عن السبب، ولا نعيد توزيع العملاء دول على حد شغال؟',
  });
  const late = team.filter((t) => t.overdue >= 20);
  if (late.length > 0) decisions.push({
    title: `${late.reduce((n, t) => n + t.overdue, 0)} مهمة متأخرة متجمعة عند ${late.length} موظفين`,
    why: `${late.map((t) => `${t.name} ${t.overdue}${t.openLeads === 0 ? ' (مفيش عملاء مفتوحين باسم الموظف — غالباً مهام قديمة)' : ''}`).join('، ')}.`,
    ask: 'نقفل المهام القديمة مرة واحدة، ونراجع الباقي مع كل موظف؟',
  });
  if (staleNegotiation.length > 0) decisions.push({
    title: `${staleNegotiation.length} عميل في التفاوض من أكتر من أسبوع بدون حركة`,
    why: 'دي أقرب صفقات للقفل، والسكوت الطويل معناه إن العميل بيقارن أو بيستنى عرض أحسن.',
    ask: 'نتدخل بخصم/زيارة/مكالمة من الإدارة، ولا نقفلهم خسارة؟',
  });
  const waitingNow = unanswered.filter((u) => u.waitingHours <= 48);
  if (waitingNow.length > 0) decisions.push({
    title: `${waitingNow.length} عميل كتبوا ومستنيين رد من أكتر من ساعة`,
    why: 'العميل اللي مابيترادش عليه في نفس اليوم بيروح لمنافس.',
    ask: 'نحدد مسؤول يغطي الرد لحد آخر اليوم؟',
  });

  const subject = `تقرير الـ CRM اليومي — ${dateISO}${decisions.length ? ` — ${decisions.length} ${decisions.length <= 10 && decisions.length > 2 ? 'قرارات محتاجة' : 'قرار محتاج'} رأيكم` : ''}`;
  const html = renderHtml({ date: dateISO, decisions, summary, team, pipeline, unanswered, staleNegotiation });
  return { date: dateISO, decisions, summary, team, pipeline, unanswered, staleNegotiation, html, subject };
}

// ── HTML (email-safe: tables + inline styles, RTL)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const NAVY = '#0D2137';
const GOLD = '#C9A227';
const RED = '#D72B2B';

function section(title: string, body: string, pageBreak = false) {
  return `<tr><td style="padding:28px 28px 8px;${pageBreak ? 'page-break-before:always;' : ''}">
    <h2 style="margin:0 0 14px;font-size:19px;color:${NAVY};border-bottom:2px solid ${GOLD};padding-bottom:8px">${title}</h2>${body}</td></tr>`;
}

function table(head: string[], rows: (string | number)[][], highlight?: (r: (string | number)[]) => boolean) {
  const th = head.map((h) => `<th style="text-align:right;padding:8px 10px;background:#F1F4F7;color:${NAVY};font-size:13px;border-bottom:1px solid #DDE3EA">${h}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c, i) => `<td style="padding:8px 10px;font-size:14px;border-bottom:1px solid #EEF1F4;${i > 0 ? 'text-align:center;' : ''}${highlight?.(r) ? `color:${RED};font-weight:bold;` : ''}">${esc(String(c))}</td>`).join('')}</tr>`).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${th ? `<tr>${th}</tr>` : ''}${tr}</table>`;
}

function renderHtml(r: Omit<CrmDailyReport, 'html' | 'subject'>): string {
  const decisions = r.decisions.length
    ? r.decisions.map((d, i) => `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;border:1px solid #E6E9EE;border-right:4px solid ${GOLD};border-radius:6px">
        <tr><td style="padding:14px 16px">
          <div style="font-size:16px;font-weight:bold;color:${NAVY}">${i + 1}. ${esc(d.title)}</div>
          <div style="font-size:14px;color:#555;margin-top:6px">${esc(d.why)}</div>
          <div style="font-size:14px;color:${NAVY};margin-top:8px;font-weight:bold">المطلوب: ${esc(d.ask)}</div>
        </td></tr></table>`).join('')
    : '<p style="font-size:15px;color:#555">مفيش قرارات معلقة النهارده.</p>';

  const summary = `<table width="100%" cellpadding="0" cellspacing="0"><tr>${r.summary.map((s) => `
    <td style="padding:6px;width:${Math.floor(100 / 4)}%;vertical-align:top">
      <div style="background:#F6F8FA;border-radius:6px;padding:12px;text-align:center">
        <div style="font-size:26px;font-weight:bold;color:${NAVY}">${s.value}</div>
        <div style="font-size:12px;color:#666;margin-top:4px">${s.label}</div>
      </div></td>`).reduce((acc, cell, i) => acc + (i > 0 && i % 4 === 0 ? '</tr><tr>' : '') + cell, '')}</tr></table>`;

  const team = r.team.length
    ? table(['الموظف', 'عملاء مفتوحين', 'عملاء اتكلم معاهم', 'رسائل', 'تحديثات على العملاء', 'مهام خلصت', 'مهام متأخرة'],
        r.team.map((t) => [t.name, t.openLeads, t.leadsMessaged, t.messages, t.activities, t.tasksDone, t.overdue]),
        (row) => Number(row[1]) >= 10 && Number(row[3]) === 0)
      + `<p style="font-size:12px;color:#888;margin-top:8px">«رسائل» = اللي اتبعتت من الـ CRM باسم الموظف. الرسائل من موبايلات الشركة مش بتتنسب لحد.</p>`
    : '<p>مفيش نشاط مسجل.</p>';

  const pipe = table(['المرحلة', 'مصر', 'السعودية'], r.pipeline.map((p) => [p.label, p.eg, p.sa]));

  const waiting = r.unanswered.filter((u) => u.waitingHours <= 48);
  const alerts =
    `<h3 style="font-size:15px;color:${NAVY};margin:6px 0 8px">عملاء مستنيين رد (${waiting.length})</h3>`
    + (waiting.length ? table(['العميل', 'المسؤول', 'مستني من (ساعة)'], waiting.slice(0, 20).map((u) => [u.name, u.owner, u.waitingHours])) : '<p style="color:#555">كله اترد عليه.</p>')
    + `<h3 style="font-size:15px;color:${NAVY};margin:20px 0 8px">تفاوض واقف أكتر من أسبوع (${r.staleNegotiation.length})</h3>`
    + (r.staleNegotiation.length ? table(['العميل', 'المسؤول', 'أيام بدون حركة'], r.staleNegotiation.map((s) => [s.name, s.owner, s.days])) : '<p style="color:#555">مفيش.</p>');

  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#EEF1F4;font-family:Tahoma,Arial,sans-serif;direction:rtl">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F4;padding:20px 0"><tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border-radius:8px;overflow:hidden;direction:rtl;text-align:right">
  <tr><td style="background:${NAVY};padding:22px 28px;color:#fff">
    <div style="font-size:13px;color:${GOLD}">Heliopolis International · HelioMax</div>
    <div style="font-size:22px;font-weight:bold;margin-top:4px">تقرير الـ CRM اليومي</div>
    <div style="font-size:14px;opacity:.85;margin-top:4px">${r.date} — شغل النهارده بس (مصر)</div>
  </td></tr>
  ${section('قرارات محتاجة نقاش أو موافقة', decisions)}
  ${section('ملخص اليوم', summary, true)}
  ${section('الفريق', team)}
  ${section('القمع (كل العملاء لحد دلوقتي)', pipe)}
  ${section('تنبيهات', alerts)}
  <tr><td style="padding:20px 28px;font-size:12px;color:#999;border-top:1px solid #EEF1F4">التقرير ده بيطلع تلقائياً من الـ CRM كل يوم الساعة 5 مساءً. loomark.vercel.app</td></tr>
</table></td></tr></table></body></html>`;
}
