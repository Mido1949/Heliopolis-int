import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPersonalReportData } from '@/lib/reports/personal-report';
import { createNotification } from '@/lib/notifications/in-app';
import { verifyCronAuth, withCronAlert, isCairoWindow, cairoNow } from '@/lib/cron/guard';

export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isCairoWindow({ hour: 15, minute: 50, days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'] })) {
    return NextResponse.json({ ok: true, skipped: 'outside_window' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, name')
    .neq('id', null);
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const cairo = cairoNow();
  const today = cairo.dateISO;
  const results: { user_id: string; status: 'sent' | 'skipped' | 'error'; error?: string }[] = [];

  for (const p of (profiles || []) as { id: string; name: string }[]) {
    try {
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'personal_report')
        .eq('user_id', p.id)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .limit(1);

      if (existing && existing.length > 0) {
        results.push({ user_id: p.id, status: 'skipped' });
        continue;
      }

      const data = await getPersonalReportData(p.id, today);
      await createNotification(
        p.id,
        `📊 تقريرك الشخصي جاهز (Personal report ready) — ${today}`,
        undefined,
        { type: 'personal_report', data: data as unknown as Record<string, unknown> }
      );
      results.push({ user_id: p.id, status: 'sent' });
    } catch (err) {
      results.push({ user_id: p.id, status: 'error', error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({ ok: true, date: today, delivered: results.filter(r => r.status === 'sent').length, results });
}

export async function GET(request: NextRequest) {
  return withCronAlert('personal-report', () => handle(request));
}

export async function POST(request: NextRequest) {
  return withCronAlert('personal-report', () => handle(request));
}
