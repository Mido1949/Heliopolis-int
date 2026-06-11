import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPersonalReportData } from '@/lib/reports/personal-report';
import { createNotification } from '@/lib/notifications/in-app';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const provided = authHeader?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch all active profiles
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, name')
    .neq('id', null);
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const results: { user_id: string; status: 'sent' | 'error'; error?: string }[] = [];

  for (const p of (profiles || []) as { id: string; name: string }[]) {
    try {
      const data = await getPersonalReportData(p.id, today);
      await createNotification(
        p.id,
        `📊 تقريرك الشخصي جاهز (Personal report ready) — ${today}`,
        undefined,
        { type: 'personal_report', data }
      );
      results.push({ user_id: p.id, status: 'sent' });
    } catch (err) {
      results.push({ user_id: p.id, status: 'error', error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({ ok: true, date: today, delivered: results.length, results });
}
