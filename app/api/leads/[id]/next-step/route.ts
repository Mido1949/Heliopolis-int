import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

const LEADER_ROLES = ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'];

/**
 * Next-step routes for a lead (spec 005 US5 / FR-009).
 *
 * A rep's "next step" is modeled on the existing `tasks` table (research D1):
 * a `tasks` row with `auto_created = false`, `lead_id` set, `assigned_to` =
 * the lead owner, `due_date` = when, open until `status='done'` + `completed_at`.
 *
 * Manual only: a human sets/completes it — nothing here changes a lead's owner
 * or stage. Uses the user's session client so the insert passes `tasks` RLS
 * (org_isolation_tasks) — we set `org_id` = the user's org so a regular owner
 * (non-manager) is allowed to insert.
 */

function getClient() {
  const cookieStore = cookies();
  return createServerClient(
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
}

// POST — create or replace the lead's open next step.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const leadId = params.id;

  let body: { title?: string; description?: string; due_date?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const description = (body.description || '').trim();
  const title = (body.title || '').trim() || (description ? description.slice(0, 80) : 'خطوة تالية');
  const dueDate = body.due_date || null;

  if (!description && !body.title) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }

  // Load the lead (owner + org) and the caller's profile (role + org).
  const [{ data: lead, error: leadErr }, { data: profile }] = await Promise.all([
    supabase.from('leads').select('id, name, assigned_to_user, org_id').eq('id', leadId).maybeSingle(),
    supabase.from('profiles').select('id, role, org_id').eq('id', user.id).single(),
  ]);

  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 400 });
  if (!lead) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const isOwner = lead.assigned_to_user === user.id;
  const isLeader = !!profile && LEADER_ROLES.includes(profile.role);
  if (!isOwner && !isLeader) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // org_id must match the caller's org for the tasks RLS insert to pass.
  const orgId = profile?.org_id ?? lead.org_id ?? null;
  // The task is owned by the lead's owner (fallback: the caller, e.g. a leader
  // setting a step on a still-unassigned lead).
  const assignee = lead.assigned_to_user ?? user.id;

  // "Replace": if an open manual next-step already exists for this lead, edit
  // it in place so there is one open next step per lead.
  const { data: existingOpen } = await supabase
    .from('tasks')
    .select('id')
    .eq('lead_id', leadId)
    .eq('auto_created', false)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let taskId: string | null = null;
  if (existingOpen) {
    const { data: updated, error: updErr } = await supabase
      .from('tasks')
      .update({ title, description, due_date: dueDate, assigned_to: assignee })
      .eq('id', existingOpen.id)
      .select('id')
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
    taskId = updated.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('tasks')
      .insert({
        title,
        description,
        lead_id: leadId,
        assigned_to: assignee,
        created_by: user.id,
        due_date: dueDate,
        status: 'pending',
        priority: 'medium',
        auto_created: false,
        org_id: orgId,
      })
      .select('id')
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    taskId = inserted.id;
  }

  // Log the manual next-step set as an activity (free-text type — no enum).
  await supabase.from('lead_activities').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'next_step_set',
    body: dueDate ? `${description} (يستحق: ${dueDate})` : description,
    org_id: orgId,
  });

  return NextResponse.json({ ok: true, task_id: taskId, replaced: !!existingOpen });
}

// PATCH — complete an open next step.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const leadId = params.id;

  let body: { task_id?: string };
  try { body = await request.json(); } catch { body = {}; }

  const [{ data: lead, error: leadErr }, { data: profile }] = await Promise.all([
    supabase.from('leads').select('id, assigned_to_user, org_id').eq('id', leadId).maybeSingle(),
    supabase.from('profiles').select('id, role, org_id').eq('id', user.id).single(),
  ]);

  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 400 });
  if (!lead) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const isOwner = lead.assigned_to_user === user.id;
  const isLeader = !!profile && LEADER_ROLES.includes(profile.role);
  if (!isOwner && !isLeader) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Resolve which task to complete: the given id, else the lead's newest open
  // manual next step.
  let taskQuery = supabase
    .from('tasks')
    .select('id, title, description')
    .eq('lead_id', leadId)
    .eq('auto_created', false)
    .eq('status', 'pending');
  taskQuery = body.task_id ? taskQuery.eq('id', body.task_id) : taskQuery.order('created_at', { ascending: false });
  const { data: task } = await taskQuery.limit(1).maybeSingle();

  if (!task) return NextResponse.json({ error: 'no_open_next_step' }, { status: 404 });

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('tasks')
    .update({ status: 'done', completed_at: now })
    .eq('id', task.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  await supabase.from('lead_activities').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'next_step_done',
    body: `تم إنجاز: ${task.description || task.title}`,
    org_id: profile?.org_id ?? lead.org_id ?? null,
  });

  return NextResponse.json({ ok: true, task_id: task.id });
}
