import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { generateCompanyReport } from '@/lib/reports/company-report';
import { sendTelegramMessage } from '@/lib/notifications/telegram';
import { Resend } from 'resend';
import { createNotification } from '@/lib/notifications/in-app';
import { verifyCronAuth, withCronAlert, isCairoWindow, cairoNow } from '@/lib/cron/guard';

export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Wide tolerance for Hobby single-daily cron + DST; the 'company_report_sent'
  // today-marker guarantees exactly-once delivery.
  if (!isCairoWindow({ hour: 15, minute: 50, toleranceMin: 120, days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'] })) {
    return NextResponse.json({ ok: true, skipped: 'outside_window' });
  }

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

  const cairo = cairoNow();
  const today = cairo.dateISO;

  const { data: existingMarker } = await supabase
    .from('notifications')
    .select('id')
    .eq('type', 'company_report_sent')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .limit(1);

  if (existingMarker && existingMarker.length > 0) {
    return NextResponse.json({ ok: true, skipped: 'already_sent' });
  }

  let report;
  try {
    report = await generateCompanyReport(today);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'report generation failed' }, { status: 500 });
  }

  const pipelineLines = Object.entries(report.pipeline.by_stage)
    .map(([s, c]) => `${s}: ${c}`)
    .join('\n');
  const wonLines = (report.won_today || []).map(w => `• ${w.name} — $${w.deal_value}`).join('\n') || 'None';
  const flags = (report.flags || []).map(f => `• ${f}`).join('\n') || 'None';

  const text = `📊 *HelioMax Company Report* — ${today}\n\n` +
    `*Pipeline Snapshot*\n${pipelineLines}\n` +
    `Conversion: ${report.pipeline.conversion_rate}\n` +
    `Pipeline Value: $${report.pipeline.pipeline_value.toLocaleString()}\n\n` +
    `*Won Today*\n${wonLines}\n\n` +
    `*Stuck Leads (3+ days)*\n${flags}\n\n` +
    `*AI Insight*\n${report.ai_insight}`;

  const delivery: { telegram?: { ok: boolean; error?: string }; email?: { ok: boolean; error?: string } } = {};

  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    try {
      await sendTelegramMessage(text);
      delivery.telegram = { ok: true };
    } catch (err) {
      delivery.telegram = { ok: false, error: err instanceof Error ? err.message : 'telegram failed' };
    }
  }

  if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: 'HelioMax Reports <onboarding@resend.dev>',
        to: process.env.ADMIN_EMAIL,
        subject: `HelioMax Company Report — ${today}`,
        text,
      });
      if (error) throw new Error(error.message);
      delivery.email = { ok: true };
    } catch (err) {
      delivery.email = { ok: false, error: err instanceof Error ? err.message : 'email failed' };
    }
  }

  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'Manager'])
    .limit(1);

  if (admins && admins.length > 0) {
    await createNotification(
      admins[0].id,
      `📈 تم إرسال تقرير الشركة — ${today}`,
      undefined,
      { type: 'company_report_sent' }
    );
  }

  return NextResponse.json({ ok: true, date: today, delivery, report });
}

export async function GET(request: NextRequest) {
  return withCronAlert('company-report', () => handle(request));
}

export async function POST(request: NextRequest) {
  return withCronAlert('company-report', () => handle(request));
}
