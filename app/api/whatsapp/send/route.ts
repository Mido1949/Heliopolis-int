import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// The one number on 360dialog (Coexistence). Replies only go out from it.
const BUSINESS_PHONE = process.env.WA_360_BUSINESS_PHONE || '201006600259';
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * POST { leadId, text } — a rep replies to a lead from the CRM.
 *
 * Free-form text is only allowed inside Meta's 24-hour customer-service
 * window (free of charge); outside it Meta requires a paid template, so the
 * route refuses instead of failing at Meta. The lead is read with the rep's
 * own session, so RLS decides who may write to whom.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.D360_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'واتساب مش متوصل (D360_API_KEY ناقص)' }, { status: 503 });

  let body: { leadId?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const text = body.text?.trim();
  if (!body.leadId || !text) return NextResponse.json({ error: 'leadId و text مطلوبين' }, { status: 400 });
  if (text.length > 4096) return NextResponse.json({ error: 'الرسالة أطول من 4096 حرف' }, { status: 400 });

  const { data: lead } = await supabase
    .from('leads')
    .select('id, phone_normalized, country')
    .eq('id', body.leadId)
    .maybeSingle();
  if (!lead?.phone_normalized) return NextResponse.json({ error: 'الليد مش موجود أو مالوش رقم' }, { status: 404 });

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: lastIn } = await admin
    .from('wa_messages')
    .select('sent_at')
    .eq('customer_phone', lead.phone_normalized)
    .eq('business_phone', BUSINESS_PHONE)
    .eq('direction', 'in')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastIn || Date.now() - new Date(lastIn.sent_at).getTime() > WINDOW_MS) {
    return NextResponse.json(
      { error: 'outside_window', message: 'عدّى أكتر من 24 ساعة من آخر رسالة من العميل. الرد المجاني مقفول، ابعتله من الموبايل أو استنى يكلمك.' },
      { status: 409 },
    );
  }

  const res = await fetch('https://waba-v2.360dialog.io/messages', {
    method: 'POST',
    headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: lead.phone_normalized,
      type: 'text',
      text: { body: text },
    }),
  });
  const out = await res.json().catch(() => ({}));
  const wamid: string | undefined = out?.messages?.[0]?.id;
  if (!res.ok || !wamid) {
    console.error('[wa-send] 360dialog rejected', res.status, JSON.stringify(out).slice(0, 500));
    return NextResponse.json({ error: 'واتساب رفض الرسالة', detail: out?.error ?? out }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { error: insErr } = await admin.from('wa_messages').insert({
    wamid,
    lead_id: lead.id,
    business_phone: BUSINESS_PHONE,
    customer_phone: lead.phone_normalized,
    direction: 'out',
    origin: 'api',
    msg_type: 'text',
    body: text,
    status: 'sent',
    sent_at: now,
    country: lead.country === 'SA' ? 'SA' : 'EG',
    sent_by: user.id,
  });
  // The message is already sent; a failed log row must not look like a failed send.
  if (insErr) console.error('[wa-send] sent but not logged', wamid, insErr);

  await admin.from('leads').update({ last_contact_date: now }).eq('id', lead.id);

  return NextResponse.json({ ok: true, wamid });
}
