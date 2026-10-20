import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { createNotification } from '@/lib/notifications/in-app';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/[id]/transfer  { to: <profile id> }
 *
 * Hands a lead (and its WhatsApp chat) to a teammate. Human action only.
 * The caller must be able to see the lead through RLS; the write itself runs
 * with the service role because the caller loses sight of the lead the moment
 * ownership moves, which would make an RLS-checked UPDATE ... RETURNING fail.
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

  const { to } = (await request.json().catch(() => ({}))) as { to?: string };
  if (!to || to === user.id) {
    return NextResponse.json({ error: 'invalid_target' }, { status: 400 });
  }

  // Visibility check through the caller's own RLS.
  const { data: lead } = await supabase
    .from('leads')
    .select('id, name, phone_normalized, org_id, country, assigned_to_user')
    .eq('id', params.id)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: target }, { data: me }] = await Promise.all([
    admin.from('profiles').select('id, name, org_id, country, crm_team').eq('id', to).maybeSingle(),
    admin.from('profiles').select('name').eq('id', user.id).maybeSingle(),
  ]);
  if (!target || target.org_id !== lead.org_id || (lead.country && target.country && target.country !== lead.country)) {
    return NextResponse.json({ error: 'invalid_target' }, { status: 400 });
  }

  const previousOwner = lead.assigned_to_user;
  const { error: updateErr } = await admin
    .from('leads')
    .update({
      assigned_to_user: target.id,
      assigned_by: user.id,
      ...(target.crm_team ? { assigned_to_team: target.crm_team } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  // Open follow-ups travel with the lead.
  if (previousOwner) {
    const { error: taskErr } = await admin
      .from('tasks')
      .update({ assigned_to: target.id })
      .eq('lead_id', lead.id)
      .eq('assigned_to', previousOwner)
      .eq('status', 'pending');
    if (taskErr) console.error('[leads/[id]/transfer] task move failed:', taskErr.message);
  }

  const fromName = me?.name ?? 'زميل';
  const { error: activityErr } = await admin.from('lead_activities').insert({
    lead_id: lead.id,
    user_id: user.id,
    type: 'assignment',
    body: `تم التحويل لـ: ${target.name ?? ''}`,
    org_id: lead.org_id,
  });
  if (activityErr) console.error('[leads/[id]/transfer] activity log failed:', activityErr.message);

  try {
    await createNotification(
      target.id,
      `${fromName} حوّلك محادثة ${lead.name || '+' + (lead.phone_normalized ?? '')}`,
      lead.id,
      { type: 'assignment', from: user.id, data: { url: `/whatsapp?lead=${lead.id}` } }
    );
  } catch (e) {
    // The transfer itself already succeeded.
    console.error('[leads/[id]/transfer] notification failed:', e);
  }

  return NextResponse.json({ ok: true, to: target.id, name: target.name });
}
