import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { createNotification } from '@/lib/notifications/in-app';
import type { PipelineStage } from '@/types';
import { statusForStage } from '@/lib/leads/stageStatus';

export const dynamic = 'force-dynamic';

const LEADER_ROLES = ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'];
const VALID_STAGES: PipelineStage[] = [
  'NEW', 'WELCOME_SENT', 'NO_RESPONSE', 'INTERESTED', 'PRICING', 'QUOTED',
  'NEGOTIATION', 'WON', 'LOST', 'POSTPONED',
];
const MAX_IDS = 200;

interface PerId {
  id: string;
  status: 'ok' | 'already_taken' | 'not_found' | 'error';
  error?: string;
}

/**
 * POST /api/leads/bulk — bulk claim / assign / advance (spec 005 US9/FR-014).
 *
 * Human-initiated bulk action (a leader clears a backlog, or a rep claims a
 * selection). Manual guard: nothing autonomous — the caller explicitly chooses.
 *
 * - claim   : any org member; each lead claimed ATOMICALLY (assigned_to_user
 *             IS NULL guard) so it can't steal an already-owned lead.
 * - assign  : leader/manager only; sets owner + notifies the assignee.
 * - advance : leader/manager only; sets pipeline_stage (+ stage_timestamps).
 *
 * Resilient: each id is processed independently; returns a per-id summary so a
 * partial failure (e.g. already_taken) doesn't abort the batch.
 */
export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch { /* noop */ }
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch { /* noop */ }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    ids?: string[];
    action?: 'claim' | 'assign' | 'advance';
    assigned_to_user?: string;
    pipeline_stage?: PipelineStage;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const ids = Array.from(new Set((body.ids || []).filter(Boolean)));
  const action = body.action;
  if (!ids.length) return NextResponse.json({ error: 'ids is required' }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `too many ids (max ${MAX_IDS})` }, { status: 400 });
  if (!action || !['claim', 'assign', 'advance'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single();
  const isLeader = !!profile && LEADER_ROLES.includes(profile.role);

  // assign / advance are leader/manager only.
  if ((action === 'assign' || action === 'advance') && !isLeader) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (action === 'assign' && !body.assigned_to_user) {
    return NextResponse.json({ error: 'assigned_to_user is required for assign' }, { status: 400 });
  }
  if (action === 'advance' && (!body.pipeline_stage || !VALID_STAGES.includes(body.pipeline_stage))) {
    return NextResponse.json({ error: 'valid pipeline_stage is required for advance' }, { status: 400 });
  }

  // Fetch the target leads once.
  const { data: leadsData } = await supabase
    .from('leads')
    .select('id, name, pipeline_stage, assigned_to_user, stage_timestamps, org_id')
    .in('id', ids);
  const leadMap = new Map((leadsData || []).map((l) => [l.id, l as {
    id: string; name: string; pipeline_stage: string | null;
    assigned_to_user: string | null; stage_timestamps: Record<string, string> | null; org_id: string | null;
  }]));

  const results: PerId[] = [];
  const now = new Date().toISOString();

  for (const id of ids) {
    const lead = leadMap.get(id);
    if (!lead) { results.push({ id, status: 'not_found' }); continue; }
    const orgId = lead.org_id ?? profile?.org_id ?? null;

    try {
      if (action === 'claim') {
        const { data: updated } = await supabase
          .from('leads')
          .update({ assigned_to_user: user.id, updated_at: now })
          .eq('id', id)
          .is('assigned_to_user', null)
          .select('id')
          .maybeSingle();
        if (!updated) { results.push({ id, status: 'already_taken' }); continue; }
        await supabase.from('lead_activities').insert({
          lead_id: id, user_id: user.id, type: 'assignment', body: 'تم استلام الليد (جماعي)', org_id: orgId,
        });
        results.push({ id, status: 'ok' });

      } else if (action === 'assign') {
        const assignee = body.assigned_to_user!;
        const { error } = await supabase
          .from('leads')
          .update({ assigned_to_user: assignee, assigned_by: user.id, updated_at: now })
          .eq('id', id);
        if (error) { results.push({ id, status: 'error', error: error.message }); continue; }
        await supabase.from('lead_activities').insert({
          lead_id: id, user_id: user.id, type: 'assignment', body: 'تم التعيين (جماعي)', org_id: orgId,
        });
        if (assignee !== lead.assigned_to_user) {
          try {
            await createNotification(assignee, `📋 تم تحويل ${lead.name} إليك`, id, { type: 'assignment' });
          } catch (e) { console.error('[bulk] notify failed:', id, e); }
        }
        results.push({ id, status: 'ok' });

      } else { // advance
        const newStage = body.pipeline_stage!;
        const stage_timestamps = { ...(lead.stage_timestamps || {}), [newStage]: now };
        const { error } = await supabase
          .from('leads')
          .update({ pipeline_stage: newStage, status: statusForStage(newStage), stage_timestamps, updated_at: now })
          .eq('id', id);
        if (error) { results.push({ id, status: 'error', error: error.message }); continue; }
        await supabase.from('lead_activities').insert({
          lead_id: id, user_id: user.id, type: 'status_change',
          body: `${lead.pipeline_stage || 'NEW'} → ${newStage} (جماعي)`, org_id: orgId,
        });
        results.push({ id, status: 'ok' });
      }
    } catch (e) {
      results.push({ id, status: 'error', error: e instanceof Error ? e.message : 'failed' });
    }
  }

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ ok: true, action, counts, results });
}
