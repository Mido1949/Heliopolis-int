import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { generateCrmDailyReport } from '@/lib/reports/crm-daily';
import { verifyCronAuth, withCronAlert, cairoNow } from '@/lib/cron/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Mido, 2026-10-20: sent from his personal Gmail to Mr. Ali and Mr. Ehab, Mido in cc.
// The first one (2026-10-20) went out by hand with a one-off backlog note.
const REVIEW_ONLY = false;
const SENT_BY_HAND = ['2026-10-20'];
const OWNER = 'smido1949@gmail.com';
const MANAGEMENT = ['alymakarem3@gmail.com', 'ehabnayel@hotmail.com'];

async function handle(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // vercel.json fires this at 14:00 and 15:00 UTC; exactly one of the two falls in
  // Cairo's 17:xx hour whether DST is on or off, so that one alone sends.
  const cairo = cairoNow();
  const force = request.nextUrl.searchParams.get('force') === '1';
  if (!force && cairo.hour !== 17) {
    return NextResponse.json({ ok: true, skipped: 'outside_window', cairoHour: cairo.hour });
  }
  if (!force && SENT_BY_HAND.includes(cairo.dateISO)) {
    return NextResponse.json({ ok: true, skipped: 'sent_by_hand' });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json({ error: 'GMAIL_USER / GMAIL_APP_PASSWORD not set' }, { status: 500 });
  }

  const report = await generateCrmDailyReport(cairo.dateISO);
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  const info = await transport.sendMail({
    from: `HelioMax CRM <${user}>`,
    to: REVIEW_ONLY ? OWNER : MANAGEMENT,
    cc: REVIEW_ONLY ? undefined : OWNER,
    subject: report.subject,
    html: report.html,
  });

  return NextResponse.json({ ok: true, date: report.date, decisions: report.decisions.length, messageId: info.messageId });
}

export async function GET(request: NextRequest) {
  return withCronAlert('crm-daily-report', () => handle(request));
}
