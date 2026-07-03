import type { SupabaseClient } from '@supabase/supabase-js';
import { PIPELINE_STAGES } from '@/lib/constants';

/**
 * Funnel / conversion report (spec 005 US8 / FR-013).
 *
 * Computed on read from each lead's `stage_timestamps` (jsonb keyed by stage
 * code → ISO entry time). No new tables. All heavy lifting is server-side.
 *
 * Date range filters on `leads.created_at` (a lead is counted in the report if
 * it was CREATED within [from, to]) — documented choice; `stage_timestamps`
 * entry times are used only for velocity, not for the range filter.
 *
 * Graceful with incomplete history: older leads may lack early-stage
 * timestamps. Per-stage counts only count stages actually present in
 * `stage_timestamps`; time-in-stage uses each lead's own chronological
 * consecutive entries, so a lead missing NEW simply doesn't contribute to
 * NEW's average rather than skewing it.
 */

// Ordered funnel path (active stages ending at WON).
export const FUNNEL_ORDER = [
  'NEW', 'WELCOME_SENT', 'NO_RESPONSE', 'INTERESTED', 'PRICING', 'QUOTED', 'NEGOTIATION', 'WON',
] as const;

export interface FunnelStageRow {
  stage: string;
  labelAr: string;
  count: number;                    // leads that ever entered this stage
  conversionFromPrev: number | null; // % of previous funnel stage's count
  avgDaysInStage: number | null;    // avg days spent before moving on
}

export interface WinRateRow {
  key: string;
  label: string;
  won: number;
  lost: number;
  winRate: number; // WON / (WON + LOST) * 100
}

export interface FunnelReportData {
  range: { from: string | null; to: string | null };
  totalLeads: number;
  funnel: FunnelStageRow[];
  overallWinRate: WinRateRow;
  bySource: WinRateRow[];
  byRep: WinRateRow[];
}

export interface FunnelReportOptions {
  from?: string | null;   // ISO date/datetime (inclusive) on created_at
  to?: string | null;     // ISO date/datetime (inclusive) on created_at
  source?: string | null; // exact leads.source
  rep?: string | null;    // leads.assigned_to_user
  orgId?: string | null;  // scope to one org
}

interface LeadRow {
  id: string;
  source: string | null;
  assigned_to_user: string | null;
  pipeline_stage: string | null;
  created_at: string;
  stage_timestamps: Record<string, string> | null;
}

function labelFor(stage: string): string {
  return PIPELINE_STAGES.find((s) => s.value === stage)?.labelAr || stage;
}

function winRate(won: number, lost: number): number {
  const denom = won + lost;
  return denom > 0 ? Math.round((won / denom) * 1000) / 10 : 0;
}

export async function generateFunnelReport(
  supabase: SupabaseClient,
  options: FunnelReportOptions = {}
): Promise<FunnelReportData> {
  const { from = null, to = null, source = null, rep = null, orgId = null } = options;

  let query = supabase
    .from('leads')
    .select('id, source, assigned_to_user, pipeline_stage, created_at, stage_timestamps');

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  if (source) query = query.eq('source', source);
  if (rep) query = query.eq('assigned_to_user', rep);
  if (orgId) query = query.eq('org_id', orgId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const leads = (data || []) as LeadRow[];

  // ── Per-stage counts (ever entered) + time-in-stage accumulators ──
  const enteredCount: Record<string, number> = {};
  const timeSum: Record<string, number> = {};   // ms
  const timeCount: Record<string, number> = {};

  for (const lead of leads) {
    const ts = lead.stage_timestamps || {};
    // Count each stage the lead ever entered.
    for (const stage of Object.keys(ts)) {
      enteredCount[stage] = (enteredCount[stage] || 0) + 1;
    }
    // Time-in-stage from this lead's own chronological entries (robust to holes).
    const ordered = Object.entries(ts)
      .filter(([, t]) => !!t)
      .map(([stage, t]) => ({ stage, time: new Date(t).getTime() }))
      .filter((e) => !Number.isNaN(e.time))
      .sort((a, b) => a.time - b.time);
    for (let i = 0; i < ordered.length - 1; i++) {
      const span = ordered[i + 1].time - ordered[i].time;
      if (span < 0) continue;
      const s = ordered[i].stage;
      timeSum[s] = (timeSum[s] || 0) + span;
      timeCount[s] = (timeCount[s] || 0) + 1;
    }
  }

  const DAY = 24 * 60 * 60 * 1000;
  const funnel: FunnelStageRow[] = FUNNEL_ORDER.map((stage, i) => {
    const count = enteredCount[stage] || 0;
    let conversionFromPrev: number | null = null;
    if (i > 0) {
      const prev = enteredCount[FUNNEL_ORDER[i - 1]] || 0;
      conversionFromPrev = prev > 0 ? Math.round((count / prev) * 1000) / 10 : null;
    }
    const avgDaysInStage = timeCount[stage]
      ? Math.round((timeSum[stage] / timeCount[stage] / DAY) * 10) / 10
      : null;
    return { stage, labelAr: labelFor(stage), count, conversionFromPrev, avgDaysInStage };
  });

  // ── Win rate overall + by source + by rep (from current pipeline_stage) ──
  let wonAll = 0;
  let lostAll = 0;
  const bySourceAcc: Record<string, { won: number; lost: number }> = {};
  const byRepAcc: Record<string, { won: number; lost: number }> = {};

  for (const lead of leads) {
    const stage = lead.pipeline_stage;
    if (stage !== 'WON' && stage !== 'LOST') continue;
    const isWon = stage === 'WON';
    if (isWon) wonAll++; else lostAll++;

    const src = lead.source || '—';
    bySourceAcc[src] = bySourceAcc[src] || { won: 0, lost: 0 };
    if (isWon) bySourceAcc[src].won++; else bySourceAcc[src].lost++;

    const repId = lead.assigned_to_user || '—';
    byRepAcc[repId] = byRepAcc[repId] || { won: 0, lost: 0 };
    if (isWon) byRepAcc[repId].won++; else byRepAcc[repId].lost++;
  }

  // Resolve rep names.
  const repIds = Object.keys(byRepAcc).filter((k) => k !== '—');
  const repNames: Record<string, string> = {};
  if (repIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', repIds);
    (profs || []).forEach((p: { id: string; name: string }) => { repNames[p.id] = p.name; });
  }

  const bySource: WinRateRow[] = Object.entries(bySourceAcc)
    .map(([key, v]) => ({ key, label: key, won: v.won, lost: v.lost, winRate: winRate(v.won, v.lost) }))
    .sort((a, b) => (b.won + b.lost) - (a.won + a.lost));

  const byRep: WinRateRow[] = Object.entries(byRepAcc)
    .map(([key, v]) => ({
      key,
      label: key === '—' ? 'غير معيّن' : (repNames[key] || 'غير معروف'),
      won: v.won,
      lost: v.lost,
      winRate: winRate(v.won, v.lost),
    }))
    .sort((a, b) => (b.won + b.lost) - (a.won + a.lost));

  return {
    range: { from, to },
    totalLeads: leads.length,
    funnel,
    overallWinRate: { key: 'all', label: 'الإجمالي', won: wonAll, lost: lostAll, winRate: winRate(wonAll, lostAll) },
    bySource,
    byRep,
  };
}
