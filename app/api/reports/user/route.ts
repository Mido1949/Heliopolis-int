import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

const LEADER_ROLES = ['admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'];

interface LeadRow {
  id: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  pipeline_stage: string | null;
  deal_value: number | null;
  region: string | null;
  last_contact_date: string | null;
  next_follow_up: string | null;
  created_at: string;
  updated_at: string | null;
}

interface CallRow {
  id: string;
  created_at: string;
  outcome: string | null;
  duration_minutes: number | null;
  notes: string | null;
}

interface BoqRow {
  id: string;
  boq_number: string | null;
  customer_name: string | null;
  status: string | null;
  grand_total: number | null;
  created_at: string;
}

/** RFC 4180 quoting — a stray comma or newline must not shift columns. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number | null)[][]): string {
  // BOM so Excel on Windows opens the Arabic headers as UTF-8.
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

/**
 * GET /api/reports/user?userId=&from=&to=
 *
 * One team member's full activity over a date range, as a CSV that can be
 * downloaded and sent on. A leader may request any member of their own org; a
 * rep may request only their own.
 */
export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single();

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!userId || !from || !to) {
    return NextResponse.json({ error: 'userId, from and to are required' }, { status: 400 });
  }

  // A leader exports anyone in their own org; anyone else may export only
  // themselves, which is the download button on /my-report. Same CSV either
  // way, and the org check below still applies to both.
  const isSelf = userId === user.id;
  if (!caller || (!isSelf && !LEADER_ROLES.includes(caller.role))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const fromISO = `${from}T00:00:00.000Z`;
  const toISO = `${to}T23:59:59.999Z`;

  // Service role so a leader can read a team member's rows regardless of the
  // row-level policies written for that member. Org isolation is re-applied
  // by hand below, because the service key bypasses RLS entirely.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: target } = await admin
    .from('profiles')
    .select('id, name, role, org_id')
    .eq('id', userId)
    .single();

  if (!target || target.org_id !== caller.org_id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const [assignedRes, createdRes, callsRes, boqsRes] = await Promise.all([
    admin
      .from('leads')
      .select('id, name, phone, company, source, pipeline_stage, deal_value, region, last_contact_date, next_follow_up, created_at, updated_at')
      .eq('org_id', caller.org_id)
      .eq('assigned_to_user', userId)
      .order('updated_at', { ascending: false }),
    admin
      .from('leads')
      .select('id, created_at')
      .eq('org_id', caller.org_id)
      .eq('created_by', userId)
      .gte('created_at', fromISO)
      .lte('created_at', toISO),
    admin
      .from('call_logs')
      .select('id, created_at, outcome, duration_minutes, notes')
      .eq('created_by', userId)
      .gte('created_at', fromISO)
      .lte('created_at', toISO)
      .order('created_at', { ascending: false }),
    admin
      .from('boqs')
      .select('id, boq_number, customer_name, status, grand_total, created_at')
      .eq('org_id', caller.org_id)
      .eq('created_by', userId)
      .gte('created_at', fromISO)
      .lte('created_at', toISO)
      .order('created_at', { ascending: false }),
  ]);

  const allAssigned = (assignedRes.data || []) as LeadRow[];
  const calls = (callsRes.data || []) as CallRow[];
  const boqs = (boqsRes.data || []) as BoqRow[];

  // "Touched in range" = created or last updated inside it, so a lead the rep
  // worked on this week shows up even if it arrived last month.
  const inRange = allAssigned.filter(l => {
    const created = l.created_at >= fromISO && l.created_at <= toISO;
    const updated = !!l.updated_at && l.updated_at >= fromISO && l.updated_at <= toISO;
    return created || updated;
  });

  const won = inRange.filter(l => l.pipeline_stage === 'WON');
  const lost = inRange.filter(l => l.pipeline_stage === 'LOST');
  const activeValue = allAssigned
    .filter(l => !['WON', 'LOST', 'POSTPONED'].includes(l.pipeline_stage || 'NEW'))
    .reduce((sum, l) => sum + Number(l.deal_value || 0), 0);
  const wonValue = won.reduce((sum, l) => sum + Number(l.deal_value || 0), 0);

  const rows: (string | number | null)[][] = [];

  rows.push([`تقرير ${target.name} — ${target.role}`]);
  rows.push([`من ${from} إلى ${to}`]);
  rows.push([]);

  rows.push(['=== الملخص (Summary) ===']);
  rows.push(['البند', 'القيمة']);
  rows.push(['عملاء مسندين (إجمالي)', allAssigned.length]);
  rows.push(['عملاء اتحرك عليهم في الفترة', inRange.length]);
  rows.push(['عملاء سجّلهم بنفسه', (createdRes.data || []).length]);
  rows.push(['مكالمات مسجلة', calls.length]);
  rows.push(['عروض أسعار أنشأها', boqs.length]);
  rows.push(['صفقات مكتملة (WON)', won.length]);
  rows.push(['صفقات خسرانة (LOST)', lost.length]);
  rows.push(['قيمة الصفقات المكتملة (EGP)', wonValue]);
  rows.push(['قيمة خط الأنابيب النشط (EGP)', activeValue]);
  rows.push([]);

  rows.push(['=== العملاء المسندين (Assigned leads) ===']);
  rows.push([
    'الاسم', 'الهاتف', 'الشركة', 'المصدر', 'المرحلة', 'قيمة الصفقة',
    'المنطقة', 'آخر تواصل', 'المتابعة القادمة', 'تاريخ الإنشاء',
  ]);
  for (const l of allAssigned) {
    rows.push([
      l.name, l.phone, l.company, l.source, l.pipeline_stage, l.deal_value,
      l.region, l.last_contact_date, l.next_follow_up, l.created_at.slice(0, 10),
    ]);
  }
  rows.push([]);

  rows.push(['=== المكالمات (Calls) ===']);
  rows.push(['التاريخ', 'النتيجة', 'المدة (دقيقة)', 'ملاحظات']);
  for (const c of calls) {
    rows.push([c.created_at.slice(0, 10), c.outcome, c.duration_minutes, c.notes]);
  }
  rows.push([]);

  rows.push(['=== عروض الأسعار (BOQs) ===']);
  rows.push(['رقم العرض', 'العميل', 'الحالة', 'الإجمالي', 'التاريخ']);
  for (const b of boqs) {
    rows.push([b.boq_number, b.customer_name, b.status, b.grand_total, b.created_at.slice(0, 10)]);
  }

  // Keep the filename to plain ASCII so it survives every OS and shell; the
  // readable Arabic name is already the first row inside the file.
  const safeName = (target.name || 'user').replace(/[^A-Za-z0-9_-]+/g, '-') || 'user';

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}-${from}_${to}.csv`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
