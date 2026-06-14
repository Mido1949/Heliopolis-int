import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyCronAuth, withCronAlert, isCairoWindow, cairoNow } from '@/lib/cron/guard';
import { runScrape, toBusinesses } from '@/lib/scraper/run';
import { intakeLeads } from '@/lib/leads/intake';
import { createNotification } from '@/lib/notifications/in-app';
import { sendTelegramMessage } from '@/lib/notifications/telegram';

export const dynamic = 'force-dynamic';

/** The 6 dates of the current Cairo week, Saturday..Thursday (skipping Friday), as YYYY-MM-DD. */
function weekSpread(): string[] {
  const { dateISO, weekday } = cairoNow();
  const order = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const idx = order.indexOf(weekday); // 0=Sat .. 6=Fri
  // Anchor at noon UTC so ±day arithmetic never crosses a DST boundary.
  const base = new Date(dateISO + 'T12:00:00Z');
  const saturday = new Date(base);
  saturday.setUTCDate(base.getUTCDate() - idx);
  const dates: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(saturday);
    d.setUTCDate(saturday.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function handle(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Saturday ~08:00 Cairo (UTC cron restricted to Saturday). Wide tolerance for
  // Hobby single-daily cron + DST; the queued→done transition prevents re-runs.
  if (!isCairoWindow({ hour: 8, minute: 0, toleranceMin: 120, days: ['Sat'] })) {
    return NextResponse.json({ ok: true, skipped: 'outside_window' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: targets } = await supabase
    .from('scrape_targets')
    .select('id, query, region')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(10);

  if (!targets || targets.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no_queued_targets' });
  }

  const dueDates = weekSpread();
  let targetsRun = 0;
  let targetsFailed = 0;
  let created = 0;
  let duplicates = 0;
  let errors = 0;
  const perRep: Record<string, number> = {};

  for (const t of targets as { id: string; query: string; region: string }[]) {
    await supabase.from('scrape_targets').update({ status: 'running' }).eq('id', t.id);
    try {
      const results = await runScrape({ query: t.query, region: t.region });
      const summary = await intakeLeads(toBusinesses(results), { dueDates });
      await supabase
        .from('scrape_targets')
        .update({
          status: 'done',
          last_run_at: new Date().toISOString(),
          results_count: summary.created,
          error: null,
        })
        .eq('id', t.id);
      targetsRun += 1;
      created += summary.created;
      duplicates += summary.duplicates;
      errors += summary.errors;
      for (const [k, v] of Object.entries(summary.perRep)) {
        perRep[k] = (perRep[k] || 0) + v;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'scrape failed';
      await supabase.from('scrape_targets').update({ status: 'failed', error: msg }).eq('id', t.id);
      targetsFailed += 1;
      console.error('[weekly-scrape] target failed:', t.id, msg);
    }
  }

  // Resolve per-rep names for the digest.
  let distributionLines = '';
  const repIds = Object.keys(perRep);
  if (repIds.length) {
    const { data: reps } = await supabase.from('profiles').select('id, name').in('id', repIds);
    const nameById: Record<string, string> = {};
    (reps || []).forEach((r: { id: string; name: string }) => { nameById[r.id] = r.name; });
    distributionLines = repIds
      .map(id => `${nameById[id] || 'غير معروف'}: ${perRep[id]}`)
      .join('\n');
  }

  const summaryText =
    '🔍 ملخص السحب الأسبوعي\n' +
    `الأهداف المنفذة: ${targetsRun} | فشل: ${targetsFailed}\n` +
    `ليدات جديدة: ${created} | مكرر: ${duplicates} | أخطاء: ${errors}` +
    (distributionLines ? `\nالتوزيع:\n${distributionLines}` : '');

  const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
  for (const a of (admins || []) as { id: string }[]) {
    try {
      await createNotification(a.id, summaryText, undefined, { type: 'scrape_summary' });
    } catch (err) {
      console.error('[weekly-scrape] admin notify failed:', a.id, err);
    }
  }

  await sendTelegramMessage(summaryText).catch(() => {});

  return NextResponse.json({ ok: true, targetsRun, targetsFailed, created, duplicates, errors });
}

export async function GET(request: NextRequest) {
  return withCronAlert('weekly-scrape', () => handle(request));
}

export async function POST(request: NextRequest) {
  return withCronAlert('weekly-scrape', () => handle(request));
}
