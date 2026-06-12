import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── GET: Webhook Verification ────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const envToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? '';
  console.log('[meta-webhook] mode:', mode);
  console.log('[meta-webhook] hub.verify_token:', token);
  console.log('[meta-webhook] META_WEBHOOK_VERIFY_TOKEN:', envToken);
  console.log('[meta-webhook] token.length:', token?.length, '| env.length:', envToken.length);
  console.log('[meta-webhook] match:', token === envToken);
  console.log('[meta-webhook] token hex:', Buffer.from(token ?? '').toString('hex'));
  console.log('[meta-webhook] env hex:', Buffer.from(envToken).toString('hex'));

  if (mode === 'subscribe' && token === envToken) {
    return new Response(challenge ?? '', { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ── POST: Lead Ingestion ─────────────────────────────────────────────────────

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  console.log('[meta-webhook POST] raw body:', rawBody);
  console.log('[meta-webhook POST] signature header:', signature);
  console.log('[meta-webhook POST] META_APP_SECRET set:', !!process.env.META_APP_SECRET);

  if (!verifySignature(rawBody, signature)) {
    console.log('[meta-webhook POST] signature verification FAILED — returning 401');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  console.log('[meta-webhook POST] signature OK');

  let body: MetaWebhookPayload;
  try {
    body = JSON.parse(rawBody);
    console.log('[meta-webhook POST] parsed object:', body.object, '| entries:', body.entry?.length ?? 0);
  } catch (e) {
    console.error('[meta-webhook POST] JSON parse error:', e);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.object !== 'page') {
    console.log('[meta-webhook POST] ignored — object is:', body.object);
    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  }

  const results: string[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      console.log('[meta-webhook POST] change.field:', change.field);
      if (change.field !== 'leadgen') continue;
      console.log('[meta-webhook POST] processing leadgen value:', JSON.stringify(change.value));
      const result = await processLead(change.value);
      console.log('[meta-webhook POST] processLead result:', result);
      results.push(result);
    }
  }

  const hasError = results.some((r) => r.startsWith('error:'));
  console.log('[meta-webhook POST] final results:', results, '| status:', hasError ? 500 : 200);
  return NextResponse.json({ processed: results }, { status: hasError ? 500 : 200 });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature) return false;

  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function processLead(value: MetaLeadValue): Promise<string> {
  const { leadgen_id, form_id, field_data = [] } = value;

  if (!leadgen_id) return 'skipped:no_id';

  const get = (key: string) =>
    field_data.find((f) => f.name === key)?.values?.[0] ?? '';

  const name = get('full_name') || get('name') || 'Meta Lead';
  const phone = get('phone_number') || get('phone') || '';
  const email = get('email') || null;

  console.log('[meta-webhook processLead] leadgen_id:', leadgen_id);
  console.log('[meta-webhook processLead] extracted — name:', name, '| phone:', phone, '| email:', email);
  console.log('[meta-webhook processLead] field_data:', JSON.stringify(field_data));
  console.log('[meta-webhook processLead] SUPABASE_URL set:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('[meta-webhook processLead] SERVICE_KEY set:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: inserted, error } = await supabase
    .from('leads')
    .upsert(
      {
        meta_lead_id: leadgen_id,
        form_id: form_id || null,
        name,
        phone,
        email,
        source: 'Meta',
        status: 'New',
        assigned_to: null,
      },
      { onConflict: 'meta_lead_id', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Lead insert error:', error);
    return `error:${leadgen_id}`;
  }

  if (!inserted) {
    return `duplicate:${leadgen_id}`;
  }

  await notifyAdmins(inserted.id, name, phone);
  return `inserted:${leadgen_id}`;
}

async function notifyAdmins(leadId: string, name: string, phone: string): Promise<void> {
  const { data: admins } = await supabase
    .from('profiles')
    .select('id, org_id')
    .in('role', ['admin', 'Manager']);

  if (!admins || admins.length === 0) return;

  // notifications.org_id is NOT NULL with no default — must come from the profile
  const notifications = admins
    .filter((admin) => admin.org_id)
    .map((admin) => ({
      user_id: admin.id,
      title: `ليد جديد من Meta: ${name} — ${phone}`,
      type: 'meta_lead',
      reference_id: leadId,
      reference_type: 'lead',
      org_id: admin.org_id,
    }));
  if (notifications.length === 0) return;

  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) {
    console.warn('Notification insert failed (non-fatal):', error);
  }
}

// ── Payload Types ────────────────────────────────────────────────────────────

interface MetaFieldData {
  name: string;
  values: string[];
}

interface MetaLeadValue {
  leadgen_id: string;
  form_id?: string;
  page_id?: string;
  created_time?: number;
  field_data?: MetaFieldData[];
}

interface MetaChange {
  field: string;
  value: MetaLeadValue;
}

interface MetaEntry {
  id: string;
  time: number;
  changes?: MetaChange[];
}

interface MetaWebhookPayload {
  object: string;
  entry?: MetaEntry[];
}
