import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const LEADER_ROLES = ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'];
const REVERSIBLE = ['assign_lead', 'rebalance', 'create_task', 'schedule_followup'];

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  // ── Auth: admin or team-lead session ──
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || !LEADER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: action, error: fetchErr } = await service
    .from('agent_actions')
    .select('*')
    .eq('id', params.id)
    .single();
  if (fetchErr || !action) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }
  if (action.undone_at) {
    return NextResponse.json({ error: 'Already undone', reason: 'already_undone' }, { status: 409 });
  }
  if (!REVERSIBLE.includes(action.action_type)) {
    return NextResponse.json(
      { error: 'This action cannot be undone', reason: 'not_reversible' },
      { status: 409 }
    );
  }

  const payload = (action.payload || {}) as Record<string, unknown>;

  try {
    if (action.action_type === 'assign_lead' || action.action_type === 'rebalance') {
      const leadId = action.target_lead_id as string;
      const { data: lead } = await service
        .from('leads')
        .select('id, assigned_to_user, assigned_to_team, name')
        .eq('id', leadId)
        .single();
      if (!lead) {
        return NextResponse.json({ error: 'Lead no longer exists', reason: 'state_changed' }, { status: 409 });
      }
      // Recorded after-state was: assigned_to_user === action.target_user_id.
      if (lead.assigned_to_user !== action.target_user_id) {
        return NextResponse.json(
          { error: 'Lead was reassigned since this action; cannot safely undo', reason: 'state_changed' },
          { status: 409 }
        );
      }
      const update: Record<string, unknown> = {
        assigned_to_user: payload.previous_assigned_to_user ?? null,
        updated_at: new Date().toISOString(),
      };
      if (action.action_type === 'assign_lead' && 'previous_assigned_to_team' in payload) {
        update.assigned_to_team = payload.previous_assigned_to_team ?? null;
      }
      if (action.action_type === 'assign_lead' && 'previous_pipeline_stage' in payload) {
        update.pipeline_stage = payload.previous_pipeline_stage ?? null;
      }
      const { error: updErr } = await service.from('leads').update(update).eq('id', leadId);
      if (updErr) throw updErr;
    } else if (action.action_type === 'create_task' || action.action_type === 'schedule_followup') {
      const taskId = action.task_id as string | null;
      if (taskId) {
        // Only revert if the task is still pending (untouched). A completed task
        // means a human acted on it — don't silently remove their work.
        const { data: task } = await service
          .from('tasks')
          .select('id, status')
          .eq('id', taskId)
          .single();
        if (task && task.status !== 'pending') {
          return NextResponse.json(
            { error: 'Task already actioned; cannot undo', reason: 'state_changed' },
            { status: 409 }
          );
        }
        if (task) {
          const { error: delErr } = await service.from('tasks').delete().eq('id', taskId);
          if (delErr) throw delErr;
        }
      }
      // Restore prior follow-up date for schedule_followup.
      if (action.action_type === 'schedule_followup' && action.target_lead_id) {
        await service
          .from('leads')
          .update({ next_follow_up: payload.previous_next_follow_up ?? null })
          .eq('id', action.target_lead_id);
      }
    }

    const { error: markErr } = await service
      .from('agent_actions')
      .update({ undone_at: new Date().toISOString(), undone_by: user.id })
      .eq('id', params.id);
    if (markErr) throw markErr;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Undo failed';
    console.error('[agent-undo] failed:', params.id, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
