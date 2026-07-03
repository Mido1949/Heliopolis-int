import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/in-app';

/**
 * Helio autonomy engine — REMINDERS ONLY (manual-philosophy guard, spec 005 US2).
 *
 * Runs on the brain cron (Sat–Thu, 10:00 & 14:00 Cairo). Reviews the pipeline
 * and only ever REMINDS/SURFACES: it nudges assignees about stuck leads and
 * escalates long-stuck leads to a team lead. It MUST NOT move a lead, change a
 * stage, reassign an owner, or create tasks (FR-004) — those were removed. Every
 * notification is logged to `agent_actions` (origin='autonomous') and is
 * suppression-guarded so two runs/day never double-notify. Uses the
 * service-role client throughout (no RLS). The `autonomy_paused` flag remains
 * the global kill switch that now silences even these reminders.
 */

const TERMINAL_STAGES = ['WON', 'LOST', 'POSTPONED'];
const LEADER_ROLES = ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'];

// Per-run safety caps so a backlog can never produce a flood of reminders.
const MAX_STUCK = 60;
const MAX_OVERDUE_TASKS = 40;
const ESCALATE_AFTER_DAYS = 7;

export interface AutonomyAction {
  action_type: string;
  reasoning: string;
  target_lead_id?: string | null;
  target_user_id?: string | null;
}

export interface AutonomyResult {
  paused: boolean;
  ran_at: string;
  actions: AutonomyAction[];
  counts: Record<string, number>;
}

interface Settings {
  autonomy_paused: boolean;
  stuck_threshold_days: number;
  nudge_suppression_hours: number;
}

async function loadSettings(service: SupabaseClient): Promise<Settings> {
  const { data } = await service
    .from('agent_settings')
    .select('autonomy_paused, stuck_threshold_days, nudge_suppression_hours')
    .eq('id', 1)
    .single();
  return {
    autonomy_paused: data?.autonomy_paused ?? false,
    stuck_threshold_days: data?.stuck_threshold_days ?? 3,
    nudge_suppression_hours: data?.nudge_suppression_hours ?? 24,
  };
}

/** True if an identical (type, lead, user) action was recorded within `hours` and not undone. */
async function recentlyActed(
  service: SupabaseClient,
  actionType: string,
  leadId: string | null,
  userId: string | null,
  hours: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  let q = service
    .from('agent_actions')
    .select('id')
    .eq('action_type', actionType)
    .gte('created_at', cutoff)
    .is('undone_at', null)
    .limit(1);
  if (leadId) q = q.eq('target_lead_id', leadId);
  if (userId) q = q.eq('target_user_id', userId);
  const { data } = await q;
  return !!(data && data.length);
}

async function recordAction(
  service: SupabaseClient,
  a: {
    action_type: string;
    target_lead_id?: string | null;
    target_user_id?: string | null;
    task_id?: string | null;
    reasoning: string;
    payload?: Record<string, unknown>;
  }
): Promise<string | null> {
  const { data, error } = await service
    .from('agent_actions')
    .insert({
      action_type: a.action_type,
      origin: 'autonomous',
      target_lead_id: a.target_lead_id || null,
      target_user_id: a.target_user_id || null,
      task_id: a.task_id || null,
      reasoning: a.reasoning,
      payload: a.payload || {},
      created_by: null,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[autonomy] recordAction failed:', error.message);
    return null;
  }
  return data.id;
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 999;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

interface LeadRow {
  id: string;
  name: string;
  pipeline_stage: string | null;
  assigned_to_user: string | null;
  assigned_to_team: string | null;
  last_contact_date: string | null;
  updated_at: string;
  created_at: string;
  org_id: string | null;
  stage_timestamps: Record<string, string> | null;
}

export async function runAutonomyEngine(service: SupabaseClient): Promise<AutonomyResult> {
  const ranAt = new Date().toISOString();
  const settings = await loadSettings(service);

  if (settings.autonomy_paused) {
    return { paused: true, ran_at: ranAt, actions: [], counts: {} };
  }

  const actions: AutonomyAction[] = [];
  const counts: Record<string, number> = {
    stuck_nudges: 0,
    escalations: 0,
    overdue_nudges: 0,
  };

  const supHours = settings.nudge_suppression_hours;

  // Team leads (escalation targets) keyed by crm_team.
  const { data: leaders } = await service
    .from('profiles')
    .select('id, name, role, crm_team')
    .in('role', LEADER_ROLES);
  const leaderByTeam: Record<string, { id: string; name: string }> = {};
  let anyLeader: { id: string; name: string } | null = null;
  (leaders || []).forEach((l: { id: string; name: string; crm_team: string | null }) => {
    if (!anyLeader) anyLeader = { id: l.id, name: l.name };
    if (l.crm_team && !leaderByTeam[l.crm_team]) leaderByTeam[l.crm_team] = { id: l.id, name: l.name };
  });

  // ── 1. Stuck leads → nudge assignee; escalate if ≥ ESCALATE_AFTER_DAYS ──
  const staleThreshold = new Date(
    Date.now() - settings.stuck_threshold_days * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: stuck } = await service
    .from('leads')
    .select('id, name, pipeline_stage, assigned_to_user, assigned_to_team, last_contact_date, updated_at, created_at, org_id, stage_timestamps')
    .not('pipeline_stage', 'in', `(${TERMINAL_STAGES.join(',')})`)
    .or(`last_contact_date.lt.${staleThreshold},and(last_contact_date.is.null,updated_at.lt.${staleThreshold})`)
    .not('assigned_to_user', 'is', null)
    .limit(MAX_STUCK);

  for (const lead of (stuck || []) as LeadRow[]) {
    const stalenessRef = lead.last_contact_date || lead.updated_at;
    const days = Math.max(1, daysSince(stalenessRef));
    const assignee = lead.assigned_to_user!;

    // Escalate long-stuck leads to a team lead (once per suppression window).
    if (days >= ESCALATE_AFTER_DAYS) {
      const leader = leaderByTeam[lead.assigned_to_team || ''] || anyLeader;
      if (leader && leader.id !== assignee && counts.escalations < MAX_STUCK) {
        const already = await recentlyActed(service, 'escalate', lead.id, leader.id, supHours);
        if (!already) {
          const reasoning = `الليد "${lead.name}" واقف في ${lead.pipeline_stage} من ${days} أيام — صعّدته لـ ${leader.name}`;
          try {
            await createNotification(leader.id, `🚩 ${reasoning}`, lead.id, { type: 'escalation' });
            await recordAction(service, {
              action_type: 'escalate',
              target_lead_id: lead.id,
              target_user_id: leader.id,
              reasoning,
              payload: { days, stage: lead.pipeline_stage, original_assignee: assignee },
            });
            actions.push({ action_type: 'escalate', reasoning, target_lead_id: lead.id, target_user_id: leader.id });
            counts.escalations++;
          } catch (e) {
            console.error('[autonomy] escalate failed:', lead.id, e);
          }
        }
      }
    }

    // Nudge the assignee (suppressed).
    const alreadyNudged = await recentlyActed(service, 'nudge', lead.id, assignee, supHours);
    if (!alreadyNudged && counts.stuck_nudges < MAX_STUCK) {
      const reasoning = `الليد "${lead.name}" واقف في ${lead.pipeline_stage} من ${days} أيام — بعتت تذكير للمسؤول`;
      try {
        await createNotification(assignee, `⏰ ${lead.name} محتاج متابعة — واقف من ${days} أيام`, lead.id, { type: 'nudge' });
        await recordAction(service, {
          action_type: 'nudge',
          target_lead_id: lead.id,
          target_user_id: assignee,
          reasoning,
          payload: { days, stage: lead.pipeline_stage },
        });
        actions.push({ action_type: 'nudge', reasoning, target_lead_id: lead.id, target_user_id: assignee });
        counts.stuck_nudges++;
      } catch (e) {
        console.error('[autonomy] stuck nudge failed:', lead.id, e);
      }
    }
  }

  // ── 2. Overdue tasks → nudge assignee ──
  const nowISO = new Date().toISOString();
  const { data: overdue } = await service
    .from('tasks')
    .select('id, title, assigned_to, lead_id, due_date')
    .eq('status', 'pending')
    .not('due_date', 'is', null)
    .lt('due_date', nowISO)
    .limit(MAX_OVERDUE_TASKS);

  for (const t of (overdue || []) as { id: string; title: string; assigned_to: string; lead_id: string | null; due_date: string }[]) {
    if (counts.overdue_nudges >= MAX_OVERDUE_TASKS) break;
    const already = await recentlyActed(service, 'nudge', t.lead_id, t.assigned_to, supHours);
    // Also guard against double-nudging the same task: skip if a nudge for this user+lead already fired.
    if (already) continue;
    const overdueDays = Math.max(1, daysSince(t.due_date));
    const reasoning = `مهمة "${t.title}" متأخرة ${overdueDays} يوم — بعتت تذكير للمكلّف`;
    try {
      await createNotification(t.assigned_to, `⏰ مهمة متأخرة: ${t.title} (${overdueDays} يوم)`, t.lead_id || undefined, { type: 'nudge' });
      await recordAction(service, {
        action_type: 'nudge',
        target_lead_id: t.lead_id,
        target_user_id: t.assigned_to,
        task_id: t.id,
        reasoning,
        payload: { overdue_days: overdueDays, task_title: t.title },
      });
      actions.push({ action_type: 'nudge', reasoning, target_lead_id: t.lead_id, target_user_id: t.assigned_to });
      counts.overdue_nudges++;
    } catch (e) {
      console.error('[autonomy] overdue nudge failed:', t.id, e);
    }
  }

  // NOTE (spec 005 US2 / FR-004): the former sections 3 (autonomous
  // first-call `create_task`) and 4 (workload `rebalanceTeams`, which moved
  // already-claimed leads between teammates) were REMOVED. The engine no
  // longer creates tasks or changes any lead's `assigned_to_user`/stage — it
  // only reminds and escalates. Historical `create_task`/`rebalance` rows in
  // `agent_actions` are intentionally left intact (still undoable).

  return { paused: false, ran_at: ranAt, actions, counts };
}
