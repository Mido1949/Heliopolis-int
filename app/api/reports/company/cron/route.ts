import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { generateCompanyReport } from '@/lib/reports/company-report';
import { sendTelegramMessage } from '@/lib/notifications/telegram';
import { Resend } from 'resend';

export async function POST(request: NextRequest) {
  // T068: CRON_SECRET-protected
  const authHeader = request.headers.get('authorization');
  const provided = authHeader?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  const today = new Date().toISOString().slice(0, 10);
  let report;
  try {
    report = await generateCompanyReport(today);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'report generation failed' }, { status: 500 });
  }

  // Format as a structured message
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

  // Telegram
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    try {
      await sendTelegramMessage(text);
      delivery.telegram = { ok: true };
    } catch (err) {
      delivery.telegram = { ok: false, error: err instanceof Error ? err.message : 'telegram failed' };
    }
  }

  // Email
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

  return NextResponse.json({ ok: true, date: today, delivery, report });
}
