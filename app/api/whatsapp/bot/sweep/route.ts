import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sweep } from '@/lib/wa-bot/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Called every 2 minutes by pg_cron (Supabase). Answers customers left 10+
 * minutes without a reply. Needs no secret on purpose: it only does what the
 * schedule would do anyway, each message can be answered once, and calls are
 * throttled to one a minute — so a stranger calling it changes nothing.
 */
async function run() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const cutoff = new Date(Date.now() - 50_000).toISOString();
  const { data: claimed } = await db
    .from('wa_bot_settings')
    .update({ last_sweep_at: new Date().toISOString() })
    .eq('id', 1)
    .eq('enabled', true)
    .or(`last_sweep_at.is.null,last_sweep_at.lt.${cutoff}`)
    .select('id');
  if (!claimed?.length) return NextResponse.json({ skipped: true });
  return NextResponse.json(await sweep());
}

export const GET = run;
export const POST = run;
