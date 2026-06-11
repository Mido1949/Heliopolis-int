import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { createNotification } from '@/lib/notifications/in-app';
import type { PipelineStage } from '@/types';

interface AssignBody {
  lead_id: string;
  to_team: 'cs' | 'tech';
  message?: string;
  to_user_id?: string;
}

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  let body: AssignBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.lead_id || !body.to_team) {
    return NextResponse.json({ error: 'lead_id and to_team are required' }, { status: 400 });
  }

  // Determine target user (round-robin if not specified)
  let targetUserId = body.to_user_id;
  if (!targetUserId) {
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .eq('crm_team', body.to_team)
      .limit(1);
    targetUserId = users?.[0]?.id;
  }
  if (!targetUserId) {
    return NextResponse.json({ error: `No users in ${body.to_team} team` }, { status: 404 });
  }

  // Compute new stage
  const newStage: PipelineStage = body.to_team === 'tech' ? 'ASSIGNED_TECH' : 'FOLLOW_UP';
  const now = new Date().toISOString();

  // Fetch current lead for stage_timestamps merge
  const { data: current } = await supabase
    .from('leads')
    .select('stage_timestamps, name')
    .eq('id', body.lead_id)
    .single();
  if (!current) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const stage_timestamps = {
    ...((current.stage_timestamps as Record<string, string>) || {}),
    [newStage]: now,
  };

  const { data, error } = await supabase
    .from('leads')
    .update({
      assigned_to_team: body.to_team,
      assigned_to_user: targetUserId,
      pipeline_stage: newStage,
      stage_timestamps,
      last_contact_date: now,
      updated_at: now,
    })
    .eq('id', body.lead_id)
    .select('id, name, pipeline_stage, assigned_to_user, assigned_to_team')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  await createNotification(
    targetUserId,
    `📥 تم تعيين ليد لك: ${data.name}${body.message ? ` — ${body.message}` : ''}`,
    body.lead_id,
    { type: 'lead_assigned', from: user.id, to_team: body.to_team }
  );

  return NextResponse.json({ ok: true, lead: data });
}
