import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { cacheMedia } from '@/lib/wa-media';

export const dynamic = 'force-dynamic';

// The one number on 360dialog (Coexistence). Replies only go out from it.
const BUSINESS_PHONE = process.env.WA_360_BUSINESS_PHONE || '201006600259';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const D360 = 'https://waba-v2.360dialog.io';
const BUCKET = 'wa-media';

// WhatsApp's own limits per kind; anything else, or bigger, goes as a document.
const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const VIDEO_TYPES = ['video/mp4', 'video/3gpp'];
const AUDIO_TYPES = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];
// Fixed files the quick-reply buttons send. Kept in the wa-media bucket under
// presets/; replace a file there to change what every rep sends.
const PRESETS: Record<string, { key: string; name: string; type: string }> = {
  explainer: { key: 'presets/explainer.ogg', name: 'شرح هليوماكس.ogg', type: 'audio/ogg' },
  catalog: { key: 'presets/catalog.pdf', name: 'HelioMax Mini VRF catalog.pdf', type: 'application/pdf' },
  catalog_vrf: { key: 'presets/catalog-vrf.pdf', name: 'HelioMax VRF catalog.pdf', type: 'application/pdf' },
};
const LABELS: Record<string, string> = { image: '📷 صورة', video: '🎬 فيديو', document: '📄 ملف', audio: '🎤 رسالة صوتية' };

function kindOf(type: string, size: number): 'image' | 'video' | 'audio' | 'document' {
  if (IMAGE_TYPES.includes(type) && size <= 5 * 1024 * 1024) return 'image';
  if (VIDEO_TYPES.includes(type) && size <= 16 * 1024 * 1024) return 'video';
  if (AUDIO_TYPES.includes(type.split(';')[0]) && size <= 16 * 1024 * 1024) return 'audio';
  return 'document';
}

/**
 * POST { leadId, text, file?, replyTo?, forwardOf?, preset? } — a rep replies to a lead
 * from the CRM. file = { path, name, type } of an upload made through
 * /api/whatsapp/upload-url; text then becomes its caption. replyTo is the
 * wamid of a message in this chat, shown quoted on the customer's phone.
 * forwardOf is the id of any wa_messages row the rep can see; its text or
 * file is sent again to this lead.
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

  let body: {
    leadId?: string;
    text?: string;
    file?: { path?: string; name?: string; type?: string };
    replyTo?: string;
    forwardOf?: string;
    preset?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  let text = body.text?.trim() ?? '';
  const file = body.file;

  // Forwarding reuses the original's text, or its file from our media cache.
  // The original is read with the rep's session, so RLS guards it too.
  let forwarded: { key: string; name: string; type: string } | null = null;
  if (body.forwardOf) {
    const { data: src } = await supabase
      .from('wa_messages')
      .select('body, msg_type, media_id, raw')
      .eq('id', body.forwardOf)
      .maybeSingle();
    if (!src) return NextResponse.json({ error: 'الرسالة الأصلية مش موجودة' }, { status: 404 });
    const meta = (src.raw as Record<string, { mime_type?: string; filename?: string; caption?: string }> | null)?.[src.msg_type] ?? {};
    if (src.media_id) {
      forwarded = { key: src.media_id, name: meta.filename || 'file', type: meta.mime_type || '' };
      text = meta.caption ?? '';
    } else {
      text = src.body?.trim() ?? '';
    }
  }

  const preset = body.preset ? PRESETS[body.preset] ?? null : null;
  if (body.preset && !preset) return NextResponse.json({ error: 'رد جاهز غير معروف' }, { status: 400 });

  if (!body.leadId || (!text && !file?.path && !forwarded && !preset)) return NextResponse.json({ error: 'leadId و text أو ملف مطلوبين' }, { status: 400 });
  // A rep may only send what they uploaded themselves.
  if (file?.path && !file.path.startsWith(`outgoing/${user.id}/`)) {
    return NextResponse.json({ error: 'ملف غير صالح' }, { status: 400 });
  }
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

  // A file goes to WhatsApp's media store first; the message then points at it.
  let msgType = 'text';
  let payload: Record<string, unknown> = { body: text };
  let mediaId: string | null = null;
  let blob: Blob | null = null;
  const source = forwarded ?? preset ?? (file?.path ? { key: file.path, name: file.name || 'file', type: file.type || '' } : null);
  if (source) {
    let { data: stored } = await admin.storage.from(BUCKET).download(source.key);
    // An old forwarded file may not be cached yet; copy it from Meta once.
    if (!stored && forwarded && (await cacheMedia(forwarded.key, forwarded.type)).ok) {
      ({ data: stored } = await admin.storage.from(BUCKET).download(source.key));
    }
    if (!stored) {
      const error = preset ? 'الملف ده لسه متسجلش في الردود الجاهزة' : forwarded ? 'الملف الأصلي مش متاح' : 'الملف مترفعش، جرّب تاني';
      return NextResponse.json({ error }, { status: 400 });
    }
    const type = source.type || stored.type || 'application/octet-stream';
    blob = new Blob([await stored.arrayBuffer()], { type });
    msgType = kindOf(type, blob.size);

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', type);
    form.append('file', blob, source.name);
    const up = await fetch(`${D360}/media`, { method: 'POST', headers: { 'D360-API-KEY': apiKey }, body: form });
    const upOut = await up.json().catch(() => ({}));
    mediaId = upOut?.id ? String(upOut.id) : null;
    if (!up.ok || !mediaId) {
      console.error('[wa-send] media upload rejected', up.status, JSON.stringify(upOut).slice(0, 500));
      return NextResponse.json({ error: 'واتساب رفض الملف', detail: upOut?.error ?? upOut }, { status: 502 });
    }
    payload = { id: mediaId };
    if (text && msgType !== 'audio') payload.caption = text;
    if (msgType === 'document') payload.filename = source.name;
  }

  // Quote the customer's message, as WhatsApp's own reply does. Only a message
  // from this same chat may be quoted.
  let context: { message_id: string } | undefined;
  if (body.replyTo) {
    const { data: quoted } = await admin
      .from('wa_messages')
      .select('wamid')
      .eq('wamid', body.replyTo)
      .eq('customer_phone', lead.phone_normalized)
      .maybeSingle();
    if (quoted) context = { message_id: quoted.wamid };
  }

  const res = await fetch(`${D360}/messages`, {
    method: 'POST',
    headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: lead.phone_normalized,
      ...(context ? { context } : {}),
      type: msgType,
      [msgType]: payload,
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
    msg_type: msgType,
    body: mediaId ? [LABELS[msgType], text || (msgType === 'document' ? source?.name : '')].filter(Boolean).join(' — ') : text,
    media_id: mediaId,
    // The thread reads mime type and filename from raw, and the quote from
    // raw.context — the same shape Meta's webhook stores for inbound messages.
    raw: {
      ...(mediaId ? { [msgType]: { id: mediaId, mime_type: blob?.type, filename: source?.name, caption: text || undefined } } : {}),
      ...(context ? { context: { id: context.message_id } } : {}),
    },
    status: 'sent',
    sent_at: now,
    country: lead.country === 'SA' ? 'SA' : 'EG',
    sent_by: user.id,
  });
  // The message is already sent; a failed log row must not look like a failed send.
  if (insErr) console.error('[wa-send] sent but not logged', wamid, insErr);

  // Keep the file under its media id, where the thread's viewer looks for it,
  // and drop the upload slot.
  if (mediaId && blob) {
    const { error: cacheErr } = await admin.storage.from(BUCKET).upload(mediaId, blob, { contentType: blob.type, upsert: true });
    if (cacheErr) console.error('[wa-send] media cache failed', mediaId, cacheErr);
    if (file?.path && !forwarded) await admin.storage.from(BUCKET).remove([file.path]);
  }

  await admin.from('leads').update({ last_contact_date: now }).eq('id', lead.id);

  // Mido's rule: whoever answers an unassigned chat owns the lead. Only an
  // unassigned lead is claimed; a colleague's lead stays theirs. Managers
  // (no crm_team, e.g. Mido) never take leads by replying (2026-10-20).
  const { data: me } = await admin.from('profiles').select('crm_team').eq('id', user.id).maybeSingle();
  const { data: claimed } = !me?.crm_team ? { data: null } : await admin
    .from('leads')
    .update({ assigned_to_user: user.id, assigned_to_team: me?.crm_team ?? null, assigned_by: user.id })
    .eq('id', lead.id)
    .is('assigned_to_user', null)
    .is('assigned_to', null)
    .select('id, org_id');
  if (claimed?.length) {
    await admin.from('lead_activities').insert({
      lead_id: lead.id,
      user_id: user.id,
      type: 'assignment',
      body: 'استلم الليد بالرد على واتساب',
      org_id: claimed[0].org_id,
    });
  }

  return NextResponse.json({ ok: true, wamid });
}
