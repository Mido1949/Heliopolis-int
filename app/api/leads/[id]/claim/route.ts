import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/[id]/claim
 *
 * Atomic "claim" of an unassigned lead. Human action only — never called by
 * any automated/agent code path (manual-philosophy guard, spec 005 US1).
 *
 * Performs a conditional UPDATE (`assigned_to_user IS NULL`) so two
 * concurrent claimants cannot both win: whichever request's UPDATE actually
 * matches a row wins; the other gets 0 rows back and is told 409.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leadId = params.id;

  // Pre-check for a clean 404 vs 409 distinction. This does NOT affect
  // atomicity — the actual race is decided by the conditional UPDATE below.
  const { data: existing, error: fetchErr } = await supabase
    .from('leads')
    .select('id, name, pipeline_stage, assigned_to_user, org_id')
    .eq('id', leadId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 400 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (existing.assigned_to_user) {
    return NextResponse.json({ error: 'already_taken' }, { status: 409 });
  }

  const now = new Date().toISOString();

  // The atomic claim: only succeeds if still unassigned at the moment of
  // the UPDATE. Postgres evaluates WHERE per-row under the row lock, so of
  // two concurrent requests exactly one matches this predicate.
  const { data: updated, error: updateErr } = await supabase
    .from('leads')
    .update({ assigned_to_user: user.id, updated_at: now })
    .eq('id', leadId)
    .is('assigned_to_user', null)
    .select('id, name, pipeline_stage, assigned_to_user, assigned_to_team, assigned_by, org_id')
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  if (!updated) {
    // Someone else's claim (or assignment) won the race between our
    // pre-check and this UPDATE.
    return NextResponse.json({ error: 'already_taken' }, { status: 409 });
  }

  // Log the claim as an `assignment` activity (matches existing shape used
  // by KanbanView/LeadDrawer assignment inserts).
  const { error: activityErr } = await supabase.from('lead_activities').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'assignment',
    body: 'تم استلام الليد',
    org_id: updated.org_id ?? existing.org_id,
  });
  if (activityErr) {
    // Non-fatal: the claim itself already succeeded and is the source of truth.
    console.error('[leads/[id]/claim] activity log failed:', activityErr.message);
  }

  // No notification is sent: this is a self-claim (the claimer and the new
  // owner are the same person), so there is no other party to notify —
  // consistent with the pre-existing claim() implementations, which also
  // did not create a notification.

  return NextResponse.json(updated);
}
