import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyCronAuth, withCronAlert, isCairoWindow } from '@/lib/cron/guard';
import { runScrape, toBusinesses } from '@/lib/scraper/run';
import { intakeLeads } from '@/lib/leads/intake';
import { sendTelegramMessage } from '@/lib/notifications/telegram';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isCairoWindow({ hour: 8, minute: 0, days: ['Sat'] })) {
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

  let targetsRun = 0;
  let targetsFailed = 0;
  let created = 0;
  let duplicates = 0;
  let errors = 0;

  for (const t of targets) {
    await supabase.from('scrape_targets').update({ status: 'running' }).eq('id', t.id);
    try {
      const results = await runScrape({ query: t.query, region: t.region });
      const summary = await intakeLeads(toBusinesses(results));
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'scrape failed';
      await supabase.from('scrape_targets').update({ status: 'failed', error: msg }).eq('id', t.id);
      targetsFailed += 1;
    }
  }

  const summaryText =
    '🔍 ملخص السحب الأسبوعي\n' +
    `الأهداف المنفذة: ${targetsRun} | فشل: ${targetsFailed}\n` +
    `ليدات جديدة: ${created} | مكرر: ${duplicates} | أخطاء: ${errors}`;

  await sendTelegramMessage(summaryText).catch(() => {});

  return NextResponse.json({ ok: true, targetsRun, targetsFailed, created, duplicates, errors });
}

export async function GET(request: NextRequest) {
  return withCronAlert('weekly-scrape', () => handle(request));
}

export async function POST(request: NextRequest) {
  return withCronAlert('weekly-scrape', () => handle(request));
}
