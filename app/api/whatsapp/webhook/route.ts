import { createNotification } from '@/lib/notifications/in-app';
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import { parseWebhook, type ParsedMessage } from '@/lib/wa-inbound';
import { statusForStage } from '@/lib/leads/stageStatus';
import { waitUntil } from '@vercel/functions';
import { maybeReply, BOT_PHONE } from '@/lib/wa-bot/run';
import { cacheMedia } from '@/lib/wa-media';

// Omni-channel: every WhatsApp message on the team's numbers lands on its lead.
// Works for Meta calling us directly (signed with META_APP_SECRET) and for
// 360dialog relaying the same payload (unsigned, so the URL carries ?key=).

export const dynamic = 'force-dynamic';
// The bot's reply runs after the 200, inside this function's lifetime.
export const maxDuration = 60;

// Lazy — a module-scope client breaks `next build` on Vercel Preview.
let _supabase: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return _supabase;
}

// ── GET: Meta webhook verification ───────────────────────────────────────────

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
  if (expected && p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === expected) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ── POST: messages, echoes, history, statuses ────────────────────────────────

export async function POST(request: Request) {
  const raw = await request.text();
  if (!authorized(request, raw)) {
    console.warn('[wa-webhook] rejected: bad signature / key');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { messages, statuses } = parseWebhook(payload);
  let stored = 0;
  let failed = 0;

  const toAnswer = new Set<string>();
  for (const m of messages) {
    try {
      await storeMessage(m);
      stored += 1;
      if (m.direction === 'in' && m.origin === 'customer' && m.businessPhone === BOT_PHONE) toAnswer.add(m.customerPhone);
    } catch (err) {
      failed += 1;
      // Loud on purpose: silent save failures already cost the CRM two months once.
      console.error('[wa-webhook] store failed', m.wamid, err);
    }
  }

  for (const s of statuses) {
    const { error } = await db().from('wa_messages').update({ status: s.status }).eq('wamid', s.wamid);
    if (error) console.error('[wa-webhook] status update failed', s.wamid, error);
  }

  // A short pause lets a customer finish typing a burst of messages; the bot
  // then answers the latest one, once (see maybeReply's claim).
  for (const phone of Array.from(toAnswer)) {
    waitUntil(
      new Promise((r) => setTimeout(r, 6000))
        .then(() => maybeReply(phone, 'inbound'))
        .catch((err) => console.error('[wa-webhook] bot failed', phone, err)),
    );
  }

  // Always 200 once authenticated: a non-200 makes Meta retry the whole batch,
  // and the per-message errors are already logged above.
  return NextResponse.json({ stored, failed, statuses: statuses.length });
}

// Either check is enough. 360dialog relays Meta's x-hub-signature-256, signed
// with 360dialog's own app secret, so a signature that fails our secret must
// still fall through to the ?key= check instead of rejecting the request.
function authorized(request: Request, raw: string): boolean {
  return signatureValid(request, raw) || keyValid(request);
}

function signatureValid(request: Request, raw: string): boolean {
  const sig = request.headers.get('x-hub-signature-256');
  // The WhatsApp app (heliomax api) may not be the app behind the lead-form
  // webhook, so it gets its own secret and falls back to the shared one.
  const secret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
  if (!sig || !secret) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function keyValid(request: Request): boolean {
  const key = process.env.WHATSAPP_WEBHOOK_KEY;
  const given = new URL(request.url).searchParams.get('key');
  if (!key || !given) return false;
  try {
    return timingSafeEqual(Buffer.from(given), Buffer.from(key));
  } catch {
    return false;
  }
}

async function storeMessage(m: ParsedMessage): Promise<void> {
  let leadId = await findLead(m.customerPhone);

  // Only a customer writing to us creates a lead. Rep echoes and history for an
  // unknown number are kept unattached and adopted later by the DB trigger —
  // history alone would otherwise flood the CRM with 180 days of dead threads.
  let isNew = false;
  if (!leadId && m.direction === 'in' && m.origin === 'customer') {
    leadId = await createLead(m);
    isNew = true;
  }

  const { error } = await db()
    .from('wa_messages')
    .upsert(
      {
        wamid: m.wamid,
        lead_id: leadId,
        business_phone: m.businessPhone,
        phone_number_id: m.phoneNumberId,
        customer_phone: m.customerPhone,
        direction: m.direction,
        origin: m.origin,
        msg_type: m.msgType,
        body: m.body,
        media_id: m.mediaId,
        referral: m.referral,
        sent_at: m.sentAt,
        country: m.country,
        raw: m.raw,
      },
      { onConflict: 'wamid', ignoreDuplicates: true },
    );
  if (error) throw error;

  // New leads already alert the admins; an existing chat alerts its owner.
  if (leadId && !isNew && m.direction === 'in' && m.origin === 'customer'
      && Date.now() - Date.parse(m.sentAt) < 10 * 60 * 1000) {
    waitUntil(notifyOwner(leadId, m).catch((err) => console.error('[wa-webhook] owner notify failed', leadId, err)));
  }

  // Copy fresh media to our storage now, so the rep's first click is instant.
  // History backfill is skipped: hundreds of old files would outlive the function.
  if (m.mediaId && Date.now() - Date.parse(m.sentAt) < 24 * 60 * 60 * 1000) {
    const mime = (m.raw as Record<string, { mime_type?: string }>)[m.msgType]?.mime_type;
    waitUntil(cacheMedia(m.mediaId, mime).catch((err) => console.error('[wa-webhook] media cache failed', m.mediaId, err)));
  }
}

async function findLead(phone: string): Promise<string | null> {
  const { data, error } = await db()
    .from('leads')
    .select('id')
    .eq('phone_normalized', phone)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function createLead(m: ParsedMessage): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('leads')
    .insert({
      name: m.customerName || 'عميل واتساب',
      phone: '+' + m.customerPhone,
      phone_normalized: m.customerPhone,
      // 'WhatsApp' is in leads_source_check; the ad that started the chat (if
      // any) is kept on the message's `referral`, not invented as a new source.
      source: 'WhatsApp',
      pipeline_stage: 'NEW',
      status: statusForStage('NEW'),
      stage_timestamps: { NEW: now },
      assigned_to_user: null,
      assigned_to_team: null,
      // leads.org_id is NOT NULL — an explicit null overrides the column default.
      org_id: await orgId(),
      country: m.country,
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('lead insert returned no row');

  await notifyAdmins(data.id, m);
  return data.id;
}

// The CRM has one org; take it from an admin profile rather than hardcoding it.
let _orgId: string | null = null;
async function orgId(): Promise<string> {
  if (_orgId) return _orgId;
  const { data, error } = await db()
    .from('profiles')
    .select('org_id')
    .eq('role', 'admin')
    .not('org_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (error || !data?.org_id) throw error ?? new Error('no admin profile with org_id');
  _orgId = data.org_id as string;
  return _orgId;
}

// One alert per chat per 10 minutes, so a burst of messages rings once.
async function notifyOwner(leadId: string, m: ParsedMessage): Promise<void> {
  const { data: lead } = await db().from('leads').select('name, assigned_to_user').eq('id', leadId).maybeSingle();
  const owner = lead?.assigned_to_user;
  if (!owner) return;
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await db()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', owner)
    .eq('reference_id', leadId)
    .gte('created_at', since);
  if (count) return;
  const who = lead?.name || m.customerName || `+${m.customerPhone}`;
  const text = m.body ? `${who}: ${m.body.slice(0, 120)}` : `${who} بعت رسالة`;
  await createNotification(owner, text, leadId, {
    type: 'general',
    title: '💬 رسالة واتساب',
    data: { url: `/whatsapp?lead=${leadId}` },
  });
}

async function notifyAdmins(leadId: string, m: ParsedMessage): Promise<void> {
  const { data: admins } = await db().from('profiles').select('id, org_id').in('role', ['admin', 'Manager']);
  const rows = (admins ?? [])
    .filter((a) => a.org_id)
    .map((a) => ({
      user_id: a.id,
      title: `ليد جديد من واتساب: ${m.customerName ?? ''} — +${m.customerPhone}`.replace(':  —', ':'),
      type: 'lead_intake', // must be in notifications_type_check
      reference_id: leadId,
      reference_type: 'lead',
      org_id: a.org_id,
    }));
  if (rows.length === 0) return;
  const { error } = await db().from('notifications').insert(rows);
  if (error) console.warn('[wa-webhook] notification insert failed (non-fatal)', error);
}
