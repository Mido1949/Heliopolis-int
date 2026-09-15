'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/utils';
import { ACTIVE_PIPELINE_STAGES, slaColor, stageAgeDays } from '@/lib/constants';

// ── Raw row shapes ───────────────────────────────────────────────────────────

interface LeadRow {
  id: string;
  name: string | null;
  source: string | null;
  status: string | null;
  pipeline_stage: string | null;
  deal_value: number | null;
  created_at: string;
  assigned_to_user: string | null;
  stage_timestamps: Record<string, string> | null;
}

interface BoqRow {
  status: string | null;
  grand_total: number | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  score: number | null;
  role: string | null;
}

interface TaskRow {
  id: string;
  status: string;
  due_date: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  stock_quantity: number;
}

interface DailyActivityRow {
  user_id: string;
  user_name: string;
  user_role: string;
  leads_created: number;
  updates_done: number;
  calls_made: number;
  boqs_created: number;
}

// ── Derived shapes consumed by the cards ─────────────────────────────────────

export interface MetricRow {
  label: string;
  labelAr: string;
  value: string;
  /** Percent change vs the previous month. null = no comparable baseline. */
  delta: number | null;
  /** A delta where "up" is bad (e.g. lost deals) flips the colour. */
  invertDelta?: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  /** Total touches today: leads created + updates + calls. */
  activity: number;
  /** Output today: BOQs created. */
  output: number;
  score: number;
  isTop: boolean;
}

export interface ListItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: 'good' | 'warn' | 'bad';
}

/** One row of the daily activity report, with that rep's monthly target progress. */
export interface ActivityRow {
  userId: string;
  userName: string;
  userRole: string;
  leadsCreated: number;
  updatesDone: number;
  callsMade: number;
  boqsCreated: number;
  total: number;
  /** Monthly leads target for this rep; null when none is set. */
  target: number | null;
  actual: number;
  progress: number;
}

export interface RecentLead {
  id: string;
  name: string;
  source: string;
  status: string;
  createdAt: string;
}

export interface CommandCenterData {
  orgName: string;
  updatedAt: string;
  /** Executive summary — three plain-language sentences derived from the data. */
  summary: string[];
  /** Pipeline summary card: the P&L-style metric table. */
  pipelineRows: MetricRow[];
  /** Sales economics card: unit-economics equivalents. */
  economicsRows: MetricRow[];
  /** Concentric funnel rings (total → active → quoted → won). */
  funnel: { label: string; labelAr: string; count: number; value: number }[];
  /** Quadrant map of the team: activity (x) vs output (y). */
  team: TeamMember[];
  /** Daily activity report rows (ported from the old /dashboard). */
  dailyReport: ActivityRow[];
  /** The three most recently created leads. */
  recentLeads: RecentLead[];
  /** New leads per day over the last 7 days, oldest → newest. */
  leadsTrend: number[];
  /** Leaderboard, highest score first. */
  performers: { id: string; name: string; role: string; score: number; note: string }[];
  /** Monthly leads target → the completion ring in the rail. */
  target: { target: number | null; actual: number; progress: number };
  /** Decision memo recommendation. */
  memo: { recommendation: string; rationale: string; href: string; cta: string };
  /** Key drivers — things going right. */
  signals: ListItem[];
  /** Risks & mitigations — things needing a decision. */
  risks: ListItem[];
  /** Operations strip: automations, calls, tasks, scraping. */
  ops: {
    callsToday: number;
    answeredToday: number;
    tasksOpen: number;
    tasksOverdue: number;
    scrapeQueued: number;
    scrapeFailed: number;
    agentActions7d: number;
    agentActionsUndone7d: number;
    lowStock: ProductRow[];
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const EGP = new Intl.NumberFormat('en-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});

function money(n: number): string {
  return EGP.format(Math.round(n));
}

function num(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** Percent change of `current` over `previous`; null when there is no baseline. */
function delta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function inRange(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/** Whole days between the lead's NEW timestamp and its WON timestamp. */
function daysToClose(lead: LeadRow): number | null {
  const ts = lead.stage_timestamps;
  if (!ts?.WON) return null;
  const start = ts.NEW || lead.created_at;
  if (!start) return null;
  const d = (new Date(ts.WON).getTime() - new Date(start).getTime()) / 86_400_000;
  return d >= 0 ? d : null;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseCommandCenterDataArgs {
  orgId: string | null;
  orgName: string;
  /** Leaders see the whole team map; a rep sees only their own row. */
  canSeeTeam: boolean;
  userId: string | null;
}

export function useCommandCenterData({ orgId, orgName, canSeeTeam, userId }: UseCommandCenterDataArgs) {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    try {
      const [
        leadsRes,
        boqsRes,
        profilesRes,
        tasksRes,
        callsTodayRes,
        answeredTodayRes,
        lowStockRes,
        targetsRes,
        scrapeRes,
        agentRes,
        activityRes,
      ] = await withTimeout(
        Promise.all([
          supabase
            .from('leads')
            .select(
              'id, name, source, status, pipeline_stage, deal_value, created_at, assigned_to_user, stage_timestamps',
            )
            .eq('org_id', orgId),
          supabase.from('boqs').select('status, grand_total, created_at').eq('org_id', orgId),
          supabase.from('profiles').select('id, name, score, role').eq('org_id', orgId),
          supabase.from('tasks').select('id, status, due_date'),
          supabase
            .from('call_logs')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString()),
          supabase
            .from('call_logs')
            .select('*', { count: 'exact', head: true })
            .eq('outcome', 'Answered')
            .gte('created_at', todayStart.toISOString()),
          supabase
            .from('products')
            .select('id, name, stock_quantity')
            .eq('org_id', orgId)
            .lt('stock_quantity', 5)
            .limit(4),
          supabase
            .from('sales_targets')
            .select('user_id, target_value')
            .eq('org_id', orgId)
            .eq('target_type', 'leads')
            .gte('period_start', monthStart.toISOString().slice(0, 10))
            .lte('period_end', monthEnd.toISOString().slice(0, 10)),
          supabase.from('scrape_targets').select('status'),
          supabase
            .from('agent_actions')
            .select('id, undone_at')
            .gte('created_at', weekAgo.toISOString()),
          supabase.rpc('get_daily_activity_report'),
        ]),
        15000,
        'Command center fetch',
      );

      const leads = (leadsRes.data as LeadRow[] | null) ?? [];
      const boqs = (boqsRes.data as BoqRow[] | null) ?? [];
      const profiles = (profilesRes.data as ProfileRow[] | null) ?? [];
      const tasks = (tasksRes.data as TaskRow[] | null) ?? [];
      const lowStock = (lowStockRes.data as ProductRow[] | null) ?? [];
      const targets = (targetsRes.data as { user_id: string; target_value: number }[] | null) ?? [];
      const scrapes = (scrapeRes.data as { status: string }[] | null) ?? [];
      const agentActions = (agentRes.data as { id: string; undone_at: string | null }[] | null) ?? [];
      const activityAll = (activityRes.data as DailyActivityRow[] | null) ?? [];
      const activity = canSeeTeam ? activityAll : activityAll.filter(r => r.user_id === userId);

      // ── Pipeline aggregates ────────────────────────────────────────────────
      let activeCount = 0;
      let activeValue = 0;
      let quotedCount = 0;
      let quotedValue = 0;
      let wonCount = 0;
      let wonValue = 0;
      let lostCount = 0;
      const perUserLeadsThisMonth: Record<string, number> = {};
      const closeDurations: number[] = [];
      const stuck: LeadRow[] = [];

      let newThisMonth = 0;
      let newPrevMonth = 0;
      let wonThisMonth = 0;
      let wonPrevMonth = 0;

      for (const lead of leads) {
        const stage = lead.pipeline_stage || 'NEW';
        const value = Number(lead.deal_value || 0);

        if ((ACTIVE_PIPELINE_STAGES as readonly string[]).includes(stage)) {
          activeCount += 1;
          activeValue += value;
          if (slaColor(lead) === 'red') stuck.push(lead);
        }
        if (stage === 'QUOTED' || stage === 'NEGOTIATION') {
          quotedCount += 1;
          quotedValue += value;
        }
        if (stage === 'WON') {
          wonCount += 1;
          wonValue += value;
          const d = daysToClose(lead);
          if (d !== null) closeDurations.push(d);
          const wonAt = lead.stage_timestamps?.WON ?? null;
          if (inRange(wonAt, monthStart, monthEnd)) wonThisMonth += 1;
          if (inRange(wonAt, prevStart, prevEnd)) wonPrevMonth += 1;
        }
        if (stage === 'LOST') lostCount += 1;

        if (inRange(lead.created_at, monthStart, monthEnd)) {
          newThisMonth += 1;
          if (lead.assigned_to_user) {
            perUserLeadsThisMonth[lead.assigned_to_user] =
              (perUserLeadsThisMonth[lead.assigned_to_user] || 0) + 1;
          }
        }
        if (inRange(lead.created_at, prevStart, prevEnd)) newPrevMonth += 1;
      }

      // ── BOQ aggregates ─────────────────────────────────────────────────────
      let quotesSent = 0;
      let quotesSentPrev = 0;
      let revenue = 0;
      let revenueThisMonth = 0;
      let revenuePrevMonth = 0;

      for (const boq of boqs) {
        const total = Number(boq.grand_total || 0);
        if (boq.status && boq.status !== 'Draft') {
          if (inRange(boq.created_at, monthStart, monthEnd)) quotesSent += 1;
          if (inRange(boq.created_at, prevStart, prevEnd)) quotesSentPrev += 1;
        }
        if (boq.status === 'Paid') {
          revenue += total;
          if (inRange(boq.created_at, monthStart, monthEnd)) revenueThisMonth += total;
          if (inRange(boq.created_at, prevStart, prevEnd)) revenuePrevMonth += total;
        }
      }

      // ── Economics ──────────────────────────────────────────────────────────
      const closedCount = wonCount + lostCount;
      const winRate = closedCount > 0 ? (wonCount / closedCount) * 100 : 0;
      const quoteToWin = quotedCount + wonCount > 0 ? (wonCount / (quotedCount + wonCount)) * 100 : 0;
      const avgDeal = wonCount > 0 ? wonValue / wonCount : 0;
      const avgClose =
        closeDurations.length > 0
          ? closeDurations.reduce((a, b) => a + b, 0) / closeDurations.length
          : null;
      const reps = profiles.filter(p => p.role !== 'admin').length || profiles.length || 1;

      // ── Team map ───────────────────────────────────────────────────────────
      const scoreById = new Map(profiles.map(p => [p.id, Number(p.score || 0)]));
      const teamRows: TeamMember[] = activity.map(row => ({
        id: row.user_id,
        name: row.user_name,
        role: row.user_role,
        activity: Number(row.leads_created) + Number(row.updates_done) + Number(row.calls_made),
        output: Number(row.boqs_created),
        score: scoreById.get(row.user_id) ?? 0,
        isTop: false,
      }));
      const topId = [...teamRows].sort((a, b) => b.output - a.output || b.activity - a.activity)[0]?.id;
      for (const row of teamRows) row.isTop = row.id === topId;

      const performers = [...profiles]
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
        .slice(0, 4)
        .map(p => ({
          id: p.id,
          name: p.name || '—',
          role: p.role || '—',
          score: Number(p.score || 0),
          note: `${perUserLeadsThisMonth[p.id] || 0} leads this month`,
        }));

      // ── Monthly target ring ────────────────────────────────────────────────
      const targetByUser: Record<string, number> = {};
      for (const t of targets) targetByUser[t.user_id] = Number(t.target_value || 0);
      const targetTotal = targets.reduce((acc, t) => acc + Number(t.target_value || 0), 0);
      const targetProgress =
        targetTotal > 0 ? Math.min(100, Math.round((newThisMonth / targetTotal) * 100)) : 0;

      // ── Daily activity report (ported from /dashboard) ─────────────────────
      const dailyReport: ActivityRow[] = activity.map(row => {
        const target = targetByUser[row.user_id] ?? null;
        const actual = perUserLeadsThisMonth[row.user_id] || 0;
        return {
          userId: row.user_id,
          userName: row.user_name,
          userRole: row.user_role,
          leadsCreated: Number(row.leads_created),
          updatesDone: Number(row.updates_done),
          callsMade: Number(row.calls_made),
          boqsCreated: Number(row.boqs_created),
          total:
            Number(row.leads_created) +
            Number(row.updates_done) +
            Number(row.calls_made) +
            Number(row.boqs_created),
          target,
          actual,
          progress: target && target > 0 ? Math.round((actual / target) * 100) : 0,
        };
      });

      // Last 7 days of intake for the welcome strip's sparkline — derived from
      // the leads already in memory, so it costs no extra query.
      const trendBuckets: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        trendBuckets[d.toISOString().slice(0, 10)] = 0;
      }
      for (const l of leads) {
        const k = (l.created_at || '').slice(0, 10);
        if (k in trendBuckets) trendBuckets[k] += 1;
      }
      const leadsTrend = Object.values(trendBuckets);

      const recentLeads: RecentLead[] = [...leads]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3)
        .map(l => ({
          id: l.id,
          name: l.name || '—',
          source: l.source || '—',
          status: l.status || l.pipeline_stage || 'NEW',
          createdAt: l.created_at,
        }));

      // ── Operations ─────────────────────────────────────────────────────────
      const tasksOpen = tasks.filter(t => t.status === 'pending').length;
      const tasksOverdue = tasks.filter(
        t => t.status === 'pending' && t.due_date && new Date(t.due_date).getTime() < now.getTime(),
      ).length;
      const scrapeQueued = scrapes.filter(s => s.status === 'queued').length;
      const scrapeFailed = scrapes.filter(s => s.status === 'failed').length;
      const agentUndone = agentActions.filter(a => a.undone_at).length;

      // ── Risks & signals ────────────────────────────────────────────────────
      const risks: ListItem[] = [];
      if (stuck.length > 0) {
        risks.push({
          id: 'sla',
          title: `${stuck.length} leads past SLA`,
          detail: `Sitting ${Math.max(...stuck.map(stageAgeDays))}+ days in one stage → reassign or close`,
          href: '/crm',
          tone: 'bad',
        });
      }
      if (tasksOverdue > 0) {
        risks.push({
          id: 'tasks',
          title: `${tasksOverdue} overdue tasks`,
          detail: 'Follow-ups past their due date → clear or re-schedule',
          href: '/tasks',
          tone: 'bad',
        });
      }
      if (scrapeFailed > 0) {
        risks.push({
          id: 'scrape',
          title: `${scrapeFailed} failed scrape targets`,
          detail: 'Intake queue is dropping sources → re-queue in the scraper',
          href: '/scraper',
          tone: 'warn',
        });
      }
      if (lowStock.length > 0) {
        risks.push({
          id: 'stock',
          title: `${lowStock.length} products low on stock`,
          detail: lowStock.map(p => `${p.name} (${p.stock_quantity})`).join(' · '),
          href: '/inventory',
          tone: 'warn',
        });
      }
      if (quotedCount > 0 && quoteToWin < 20) {
        risks.push({
          id: 'quotes',
          title: 'Quote-to-win below 20%',
          detail: `${quotedCount} quotes open against a ${pct(quoteToWin)} close rate → review pricing`,
          href: '/boq',
          tone: 'warn',
        });
      }

      const signals: ListItem[] = [];
      const newDelta = delta(newThisMonth, newPrevMonth);
      if (newDelta !== null && newDelta > 0) {
        signals.push({
          id: 'intake',
          title: `Intake up ${newDelta}% month over month`,
          detail: `${newThisMonth} new leads this month vs ${newPrevMonth} last month`,
          href: '/crm',
          tone: 'good',
        });
      }
      if (activeValue > 0) {
        signals.push({
          id: 'pipeline',
          title: `${money(activeValue)} in active pipeline`,
          detail: `${activeCount} deals across ${ACTIVE_PIPELINE_STAGES.length} working stages`,
          href: '/crm',
          tone: 'good',
        });
      }
      if (winRate >= 40) {
        signals.push({
          id: 'winrate',
          title: `Win rate holding at ${pct(winRate)}`,
          detail: `${wonCount} won against ${lostCount} lost`,
          href: '/reports',
          tone: 'good',
        });
      }
      if (agentActions.length > 0) {
        signals.push({
          id: 'agent',
          title: `Helio took ${agentActions.length} actions this week`,
          detail:
            agentUndone > 0
              ? `${agentUndone} were undone by a human — review the audit log`
              : 'None undone — autonomy running clean',
          href: '/helio',
          tone: agentUndone > 0 ? 'warn' : 'good',
        });
      }
      if (signals.length === 0) {
        signals.push({
          id: 'quiet',
          title: 'No movement signals yet',
          detail: 'Once leads and quotes start flowing this month, drivers appear here',
          href: '/crm',
          tone: 'warn',
        });
      }

      // ── Decision memo ──────────────────────────────────────────────────────
      let memo = {
        recommendation: 'Keep the current motion',
        rationale: 'No stage is starved and nothing is past SLA — hold the plan and keep intake steady.',
        href: '/crm',
        cta: 'Open CRM',
      };
      if (stuck.length > 0) {
        memo = {
          recommendation: `Clear ${stuck.length} stalled deals before adding intake`,
          rationale: `${stuck.length} active leads have sat past the ${5}-day SLA in one stage, holding ${money(
            stuck.reduce((acc, l) => acc + Number(l.deal_value || 0), 0),
          )} of pipeline. Reassign or close them before the team takes on more.`,
          href: '/crm',
          cta: 'Triage in CRM',
        };
      } else if (quotedCount > 0 && quoteToWin < 20) {
        memo = {
          recommendation: 'Review pricing on open quotes',
          rationale: `${quotedCount} quotes are open at a ${pct(
            quoteToWin,
          )} close rate. Re-price or re-scope the largest before they age out.`,
          href: '/boq',
          cta: 'Open BOQ',
        };
      } else if (targetTotal > 0 && targetProgress < 50) {
        memo = {
          recommendation: 'Push intake to hit the monthly target',
          rationale: `${newThisMonth} of ${targetTotal} leads booked (${targetProgress}%). Queue more scrape targets and reassign idle reps.`,
          href: '/scraper',
          cta: 'Queue scraping',
        };
      }

      // ── Executive summary ──────────────────────────────────────────────────
      const summary = [
        `${num(activeCount)} active deals worth ${money(activeValue)} are in play, with ${num(
          newThisMonth,
        )} new leads booked this month${newDelta !== null ? ` (${newDelta > 0 ? '+' : ''}${newDelta}% vs last month)` : ''}.`,
        `Win rate sits at ${pct(winRate)} on ${num(closedCount)} closed deals, averaging ${money(
          avgDeal,
        )} per win${avgClose !== null ? ` and ${avgClose.toFixed(0)} days to close` : ''}.`,
        risks.length > 0
          ? `${risks.length} item${risks.length > 1 ? 's' : ''} need a decision — see Risks & Mitigations.`
          : 'Nothing is past SLA and no operational risks are open.',
      ];

      setData({
        orgName,
        updatedAt: now.toISOString(),
        summary,
        pipelineRows: [
          { label: 'New leads', labelAr: 'عملاء جدد', value: num(newThisMonth), delta: newDelta },
          { label: 'Quotes sent', labelAr: 'عروض مرسلة', value: num(quotesSent), delta: delta(quotesSent, quotesSentPrev) },
          { label: 'Deals won', labelAr: 'صفقات مكتملة', value: num(wonThisMonth), delta: delta(wonThisMonth, wonPrevMonth) },
          { label: 'Collected revenue', labelAr: 'إيرادات محصلة', value: money(revenueThisMonth), delta: delta(revenueThisMonth, revenuePrevMonth) },
          { label: 'Active pipeline', labelAr: 'خط الأنابيب النشط', value: money(activeValue), delta: null },
          { label: 'Lifetime collected', labelAr: 'إجمالي التحصيل', value: money(revenue), delta: null },
        ],
        economicsRows: [
          { label: 'Avg deal value', labelAr: 'متوسط قيمة الصفقة', value: money(avgDeal), delta: null },
          { label: 'Win rate', labelAr: 'نسبة الفوز', value: pct(winRate), delta: null },
          { label: 'Quote → win', labelAr: 'من العرض للفوز', value: pct(quoteToWin), delta: null },
          {
            label: 'Days to close',
            labelAr: 'أيام حتى الإغلاق',
            value: avgClose !== null ? `${avgClose.toFixed(0)}d` : '—',
            delta: null,
          },
          {
            label: 'Pipeline per rep',
            labelAr: 'خط الأنابيب لكل مندوب',
            value: money(activeValue / reps),
            delta: null,
          },
          { label: 'Open quotes', labelAr: 'عروض مفتوحة', value: money(quotedValue), delta: null },
        ],
        funnel: [
          { label: 'All leads', labelAr: 'كل العملاء', count: leads.length, value: leads.reduce((a, l) => a + Number(l.deal_value || 0), 0) },
          { label: 'Active', labelAr: 'نشط', count: activeCount, value: activeValue },
          { label: 'Quoted', labelAr: 'تم التسعير', count: quotedCount, value: quotedValue },
          { label: 'Won', labelAr: 'مكتمل', count: wonCount, value: wonValue },
        ],
        team: teamRows,
        dailyReport,
        recentLeads,
        leadsTrend,
        performers,
        target: {
          target: targetTotal > 0 ? targetTotal : null,
          actual: newThisMonth,
          progress: targetProgress,
        },
        memo,
        signals: signals.slice(0, 4),
        risks: risks.slice(0, 4),
        ops: {
          callsToday: callsTodayRes.count ?? 0,
          answeredToday: answeredTodayRes.count ?? 0,
          tasksOpen,
          tasksOverdue,
          scrapeQueued,
          scrapeFailed,
          agentActions7d: agentActions.length,
          agentActionsUndone7d: agentUndone,
          lowStock,
        },
      });
    } catch (err) {
      console.error('Command center fetch failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load command center data');
    } finally {
      setLoading(false);
    }
  }, [orgId, orgName, canSeeTeam, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
