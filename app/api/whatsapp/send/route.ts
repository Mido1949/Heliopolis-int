import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

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
const LABELS: Record<string, string> = { image: '📷 صورة', video: '🎬 فيديو', document: '📄 ملف', audio: '🎤 رسالة صوتية' };

function kindOf(type: string, size: number): 'image' | 'video' | 'audio' | 'document' {
  if (IMAGE_TYPES.includes(type) && size <= 5 * 1024 * 1024) return 'image';
  if (VIDEO_TYPES.includes(type) && size <= 16 * 1024 * 1024) return 'video';
  if (AUDIO_TYPES.includes(type.split(';')[0]) && size <= 16 * 1024 * 1024) return 'audio';
  return 'document';
}

/**
 * POST { leadId, text, file? } — a rep replies to a lead from the CRM.
 * file = { path, name, type } of an upload made through
 * /api/whatsapp/upload-url; text then becomes its caption.
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

  let body: { leadId?: string; text?: string; file?: { path?: string; name?: string; type?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const text = body.text?.trim() ?? '';
  const file = body.file;
  if (!body.leadId || (!text && !file?.path)) return NextResponse.json({ error: 'leadId و text أو ملف مطلوبين' }, { status: 400 });
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
  if (file?.path) {
    const { data: stored } = await admin.storage.from(BUCKET).download(file.path);
    if (!stored) return NextResponse.json({ error: 'الملف مترفعش، جرّب تاني' }, { status: 400 });
    const type = file.type || stored.type || 'application/octet-stream';
    blob = new Blob([await stored.arrayBuffer()], { type });
    msgType = kindOf(type, blob.size);

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', type);
    form.append('file', blob, file.name || 'file');
    const up = await fetch(`${D360}/media`, { method: 'POST', headers: { 'D360-API-KEY': apiKey }, body: form });
    const upOut = await up.json().catch(() => ({}));
    mediaId = upOut?.id ? String(upOut.id) : null;
    if (!up.ok || !mediaId) {
      console.error('[wa-send] media upload rejected', up.status, JSON.stringify(upOut).slice(0, 500));
      return NextResponse.json({ error: 'واتساب رفض الملف', detail: upOut?.error ?? upOut }, { status: 502 });
    }
    payload = { id: mediaId };
    if (text && msgType !== 'audio') payload.caption = text;
    if (msgType === 'document') payload.filename = file.name || 'file';
  }

  const res = await fetch(`${D360}/messages`, {
    method: 'POST',
    headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: lead.phone_normalized,
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
    body: mediaId ? [LABELS[msgType], text || (msgType === 'document' ? file?.name : '')].filter(Boolean).join(' — ') : text,
    media_id: mediaId,
    // The thread's media viewer reads mime type and filename from raw.
    raw: mediaId ? { [msgType]: { id: mediaId, mime_type: blob?.type, filename: file?.name, caption: text || undefined } } : null,
    status: 'sent',
    sent_at: now,
    country: lead.country === 'SA' ? 'SA' : 'EG',
    sent_by: user.id,
  });
  // The message is already sent; a failed log row must not look like a failed send.
  if (insErr) console.error('[wa-send] sent but not logged', wamid, insErr);

  // Keep the file under its media id, where the thread's viewer looks for it,
  // and drop the upload slot.
  if (mediaId && blob && file?.path) {
    const { error: cacheErr } = await admin.storage.from(BUCKET).upload(mediaId, blob, { contentType: blob.type, upsert: true });
    if (cacheErr) console.error('[wa-send] media cache failed', mediaId, cacheErr);
    await admin.storage.from(BUCKET).remove([file.path]);
  }

  await admin.from('leads').update({ last_contact_date: now }).eq('id', lead.id);

  // Mido's rule: whoever answers an unassigned chat owns the lead. Only an
  // unassigned lead is claimed; a colleague's lead stays theirs.
  const { data: me } = await admin.from('profiles').select('crm_team').eq('id', user.id).maybeSingle();
  const { data: claimed } = await admin
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
