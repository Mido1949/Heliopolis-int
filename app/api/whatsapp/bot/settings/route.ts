import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const LEADERS = ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'];

function admin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * GET ?leadId= — the global switch and, for a lead, its own switch.
 * POST { enabled } (leaders only) — the global switch.
 * POST { leadId, paused } — any rep who can see the lead turns the bot off/on
 *   for that chat; turning it on also clears the bot's own handoff snooze.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const leadId = new URL(request.url).searchParams.get('leadId');
  const { data: s } = await admin().from('wa_bot_settings').select('enabled').eq('id', 1).maybeSingle();
  let lead: { bot_paused: boolean; bot_snooze_until: string | null } | null = null;
  if (leadId) {
    const { data } = await supabase.from('leads').select('bot_paused, bot_snooze_until').eq('id', leadId).maybeSingle();
    lead = data;
  }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return NextResponse.json({
    enabled: Boolean(s?.enabled),
    canToggleGlobal: LEADERS.includes(me?.role ?? ''),
    paused: lead?.bot_paused ?? false,
    snoozedUntil: lead?.bot_snooze_until && new Date(lead.bot_snooze_until) > new Date() ? lead.bot_snooze_until : null,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean; leadId?: string; paused?: boolean };

  if (body.leadId) {
    // RLS on the user's own session decides whether they may touch this lead.
    const { data: lead } = await supabase.from('leads').select('id').eq('id', body.leadId).maybeSingle();
    if (!lead) return NextResponse.json({ error: 'الليد مش موجود' }, { status: 404 });
    const paused = Boolean(body.paused);
    const { error } = await admin()
      .from('leads')
      .update(paused ? { bot_paused: true } : { bot_paused: false, bot_snooze_until: null })
      .eq('id', body.leadId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, paused });
  }

  if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled مطلوب' }, { status: 400 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!LEADERS.includes(me?.role ?? '')) return NextResponse.json({ error: 'للمديرين بس' }, { status: 403 });
  const { error } = await admin()
    .from('wa_bot_settings')
    .update({ enabled: body.enabled, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enabled: body.enabled });
}
