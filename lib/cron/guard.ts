import { NextRequest, NextResponse } from 'next/server';
import { sendOpsAlert } from '@/lib/notifications/alert';

export function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET) return false;
  return token === process.env.CRON_SECRET;
}

export function cairoNow(): { weekday: 'Sat'|'Sun'|'Mon'|'Tue'|'Wed'|'Thu'|'Fri'; hour: number; minute: number; dateISO: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  // ICU/CLDR may render short weekdays with a trailing period (e.g. "Fri.") —
  // normalize to the bare 3-letter form or every window check would fail.
  const rawWeekday = get('weekday').replace(/\W/g, '').slice(0, 3);
  const weekdayMap: Record<string, 'Sat'|'Sun'|'Mon'|'Tue'|'Wed'|'Thu'|'Fri'> = {
    Sat: 'Sat', Sun: 'Sun', Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri',
  };
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return {
    weekday: weekdayMap[rawWeekday] || 'Fri',
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
    dateISO: dateFormatter.format(new Date()),
  };
}

export function isCairoWindow(opts: { hour: number; minute: number; toleranceMin?: number; days: ('Sat'|'Sun'|'Mon'|'Tue'|'Wed'|'Thu'|'Fri')[] }): boolean {
  const now = cairoNow();
  if (!opts.days.includes(now.weekday)) return false;
  const tolerance = opts.toleranceMin ?? 5;
  const totalMinutes = now.hour * 60 + now.minute;
  const targetMinutes = opts.hour * 60 + opts.minute;
  return Math.abs(totalMinutes - targetMinutes) <= tolerance;
}

export async function withCronAlert(
  jobName: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const response = await handler();
    if (!response.ok) {
      const body = await response.clone().json().catch(() => ({}));
      const errorText = (body as Record<string, unknown>).error || `HTTP ${response.status}`;
      await sendOpsAlert(`${jobName} failed: ${errorText}`);
    }
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await sendOpsAlert(`${jobName} failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
