import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/in-app';

export const dynamic = 'force-dynamic';

const TERMINAL_STAGES = ['WON', 'LOST_PRICE', 'GHOSTED', 'POSTPONED'];

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const provided = authHeader?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Find leads: not terminal stage, stale > 3 days, has an assignee
  const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('id, name, pipeline_stage, assigned_to_user, updated_at')
    .not('pipeline_stage', 'in', `(${TERMINAL_STAGES.join(',')})`)
    .lt('updated_at', staleThreshold)
    .not('assigned_to_user', 'is', null);

  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });

  const checked = (leads || []).length;
  let notified = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const lead of (leads || []) as { id: string; name: string; pipeline_stage: string; assigned_to_user: string; updated_at: string }[]) {
    try {
      // 2. Check for a recent (last 24h) "واقف" notification for this lead
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from('notifications')
        .select('id')
        .eq('lead_id', lead.id)
        .gte('created_at', cutoff)
        .ilike('message', '%واقف%')
        .limit(1);

      if (recent && recent.length > 0) continue;

      // 3. Compute days stuck
      const days = Math.max(1, Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (24 * 60 * 60 * 1000)));
      const message = `⚠️ ${lead.name} واقف في ${lead.pipeline_stage} منذ ${days} أيام`;

      await createNotification(lead.assigned_to_user, message, lead.id);
      notified += 1;
    } catch (err) {
      // Swallow per-lead errors — keep going
      console.error('[stuck-leads-cron] lead failed:', lead.id, err);
    }
  }

  return NextResponse.json({ ok: true, date: today, checked, notified });
}
