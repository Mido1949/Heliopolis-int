import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyCronAuth, withCronAlert, isCairoWindow } from '@/lib/cron/guard';
import { runAutonomyEngine } from '@/lib/agent/autonomy';
import { createNotification } from '@/lib/notifications/in-app';
import { sendTelegramMessage } from '@/lib/notifications/telegram';

export const dynamic = 'force-dynamic';

const DAYS: ('Sat' | 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu')[] = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];

async function handle(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Two valid Cairo windows per day: 10:00 and 14:00 (Sat–Thu).
  const inWindow =
    isCairoWindow({ hour: 10, minute: 0, days: DAYS }) ||
    isCairoWindow({ hour: 14, minute: 0, days: DAYS });
  if (!inWindow) {
    return NextResponse.json({ ok: true, skipped: 'outside_window' });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const result = await runAutonomyEngine(service);

  // ── Digest to admins (in-app + Telegram) ──
  const { data: admins } = await service
    .from('profiles')
    .select('id')
    .eq('role', 'admin');

  let digestText: string;
  if (result.paused) {
    digestText = '⏸️ الأوتونومي متوقف — هيليو ما اتخذش أي إجراء.';
  } else if (result.actions.length === 0) {
    digestText = '🧠 هيليو: مفيش إجراءات النهاردة. كل حاجة تمام ✅';
  } else {
    const lines = result.actions.slice(0, 25).map(a => `• ${a.reasoning}`);
    const extra = result.actions.length > 25 ? `\n…و${result.actions.length - 25} إجراء آخر` : '';
    digestText = `🧠 هيليو اتخذ ${result.actions.length} إجراء:\n${lines.join('\n')}${extra}`;
  }

  for (const admin of (admins || []) as { id: string }[]) {
    try {
      await createNotification(admin.id, digestText, undefined, { type: 'agent_digest' });
    } catch (e) {
      console.error('[brain-cron] admin digest notification failed:', admin.id, e);
    }
  }

  // Telegram (best-effort; never blocks the cron result).
  await sendTelegramMessage(digestText).catch(() => {});

  return NextResponse.json({
    ok: true,
    ran_at: result.ran_at,
    paused: result.paused,
    actions: result.actions.length,
    counts: result.counts,
  });
}

export async function GET(request: NextRequest) {
  return withCronAlert('agent-brain', () => handle(request));
}

export async function POST(request: NextRequest) {
  return withCronAlert('agent-brain', () => handle(request));
}
