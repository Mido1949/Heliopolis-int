import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { createNotification } from '@/lib/notifications/in-app';

interface ScrapedBusiness {
  name?: string;
  phone?: string;
  company?: string;
  email?: string;
  source?: string;
  address?: string;
  category?: string;
  website?: string;
}

export async function POST(request: NextRequest) {
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

  // Webhook auth via WEBHOOK_SECRET; otherwise require session
  const authHeader = request.headers.get('authorization');
  const expectedWebhookSecret = process.env.WEBHOOK_SECRET;
  const isWebhook = expectedWebhookSecret ? (authHeader === `Bearer ${expectedWebhookSecret}`) : false;
  if (!isWebhook) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: ScrapedBusiness[];
  try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(payload)) return NextResponse.json({ error: 'Expected array' }, { status: 400 });

  // Round-robin: fetch all CS team users
  const { data: csUsers } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('crm_team', 'cs')
    .order('name');
  const csUserIds = (csUsers || []).map((u: { id: string }) => u.id);
  if (csUserIds.length === 0) {
    return NextResponse.json({ error: 'No CS users available' }, { status: 503 });
  }

  // Count existing leads for round-robin start
  const { count: existingCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .in('assigned_to_user', csUserIds);
  let cursor = (existingCount || 0) % csUserIds.length;

  let created = 0;
  let duplicates = 0;
  let errors = 0;

  for (const biz of payload) {
    try {
      if (!biz.phone) { errors += 1; continue; }

      // Dedup by phone
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', biz.phone)
        .maybeSingle();
      if (existing) { duplicates += 1; continue; }

      const assignedTo = csUserIds[cursor];
      cursor = (cursor + 1) % csUserIds.length;

      const now = new Date().toISOString();
      const { data: lead, error: insertErr } = await supabase
        .from('leads')
        .insert({
          name: biz.name || biz.company || 'Unknown',
          phone: biz.phone,
          company: biz.company,
          email: biz.email,
          source: 'Phone',
          status: 'New',
          pipeline_stage: 'NEW',
          stage_timestamps: { NEW: now },
          assigned_to_user: assignedTo,
          assigned_to_team: 'cs',
          notes: biz.website ? `Website: ${biz.website}` : undefined,
        })
        .select('id')
        .single();
      if (insertErr || !lead) { errors += 1; continue; }

      // Auto-create call task
      await supabase.from('tasks').insert({
        title: `متابعة ليد جديد — ${biz.name || biz.company || 'New Lead'}`,
        description: 'مكالمة أولى (First call)',
        assigned_to: assignedTo,
        created_by: assignedTo,
        lead_id: lead.id,
        due_date: now.slice(0, 10),
        status: 'pending',
        priority: 'high',
      });

      // Notify the assigned user
      await createNotification(
        assignedTo,
        `🎯 ليد جديد معين لك: ${biz.name || biz.company || biz.phone}`,
        lead.id,
        { type: 'lead_intake' }
      );

      created += 1;
    } catch (err) {
      errors += 1;
      console.error('Intake item failed:', err);
    }
  }

  return NextResponse.json({ created, duplicates, errors });
}
