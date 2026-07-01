import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/in-app';
import { verifyCronAuth, withCronAlert, isCairoWindow } from '@/lib/cron/guard';

export const dynamic = 'force-dynamic';

const TERMINAL_STAGES = ['WON', 'LOST', 'POSTPONED'];

async function handle(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Wide tolerance for Hobby single-daily cron + DST (per-lead 24h dedup prevents repeats).
  if (!isCairoWindow({ hour: 8, minute: 0, toleranceMin: 120, days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'] })) {
    return NextResponse.json({ ok: true, skipped: 'outside_window' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  // Staleness = COALESCE(last_contact_date, updated_at) < threshold:
  // stale by last contact, or never contacted and not updated either.
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('id, name, pipeline_stage, assigned_to_user, updated_at, last_contact_date')
    .not('pipeline_stage', 'in', `(${TERMINAL_STAGES.join(',')})`)
    .or(`last_contact_date.lt.${staleThreshold},and(last_contact_date.is.null,updated_at.lt.${staleThreshold})`)
    .not('assigned_to_user', 'is', null);

  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });

  const checked = (leads || []).length;
  let notified = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const lead of (leads || []) as { id: string; name: string; pipeline_stage: string; assigned_to_user: string; updated_at: string; last_contact_date?: string | null }[]) {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'stuck_lead')
        .eq('reference_id', lead.id)
        .gte('created_at', cutoff)
        .limit(1);

      if (recent && recent.length > 0) continue;

      const stalenessRef = lead.last_contact_date || lead.updated_at;
      const days = Math.max(1, Math.floor((Date.now() - new Date(stalenessRef).getTime()) / (24 * 60 * 60 * 1000)));
      const message = `⚠️ ${lead.name} واقف في ${lead.pipeline_stage} منذ ${days} أيام`;

      await createNotification(lead.assigned_to_user, message, lead.id, { type: 'stuck_lead' });
      notified += 1;
    } catch (err) {
      console.error('[stuck-leads-cron] lead failed:', lead.id, err);
    }
  }

  return NextResponse.json({ ok: true, date: today, checked, notified });
}

export async function GET(request: NextRequest) {
  return withCronAlert('stuck-leads', () => handle(request));
}

export async function POST(request: NextRequest) {
  return withCronAlert('stuck-leads', () => handle(request));
}
