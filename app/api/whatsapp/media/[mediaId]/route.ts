import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'wa-media';
const D360 = 'https://waba-v2.360dialog.io';

/**
 * GET — a WhatsApp photo, voice note, video or file, for the CRM thread.
 *
 * The message is looked up with the viewer's own session, so lead RLS decides
 * who may open it. The first view copies the file from Meta (through
 * 360dialog) into the private wa-media bucket, because Meta deletes media
 * after about 30 days; later views are served from there.
 */
export async function GET(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  if (!/^\d+$/.test(mediaId)) return NextResponse.json({ error: 'Bad media id' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: msg } = await supabase
    .from('wa_messages')
    .select('msg_type, raw')
    .eq('media_id', mediaId)
    .limit(1)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const meta = (msg.raw as Record<string, { mime_type?: string; filename?: string }> | null)?.[msg.msg_type] ?? {};
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const cached = await admin.storage.from(BUCKET).download(mediaId);
  if (cached.data) return send(cached.data, cached.data.type || meta.mime_type, meta.filename);

  const apiKey = process.env.D360_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'D360_API_KEY missing' }, { status: 503 });

  // 360dialog proxies Meta's media host: same path, their host, their key.
  const info = await fetch(`${D360}/${mediaId}`, { headers: { 'D360-API-KEY': apiKey } });
  const { url, mime_type } = (await info.json().catch(() => ({}))) as { url?: string; mime_type?: string };
  if (!info.ok || !url) {
    return NextResponse.json({ error: 'الملف مش متاح عند واتساب (ممكن يكون اتمسح بعد 30 يوم)' }, { status: 410 });
  }
  const file = await fetch(url.replace('https://lookaside.fbsbx.com', D360), { headers: { 'D360-API-KEY': apiKey } });
  if (!file.ok) {
    console.error('[wa-media] download failed', mediaId, file.status);
    return NextResponse.json({ error: 'تعذّر تحميل الملف' }, { status: 502 });
  }
  const type = mime_type || meta.mime_type || file.headers.get('content-type') || 'application/octet-stream';
  const blob = new Blob([await file.arrayBuffer()], { type });

  const { error } = await admin.storage.from(BUCKET).upload(mediaId, blob, { contentType: type, upsert: true });
  // Still serve it; the next view just fetches from Meta again.
  if (error) console.error('[wa-media] cache upload failed', mediaId, error);

  return send(blob, type, meta.filename);
}

function send(body: Blob, type: string | undefined, filename: string | undefined) {
  const headers: Record<string, string> = {
    'Content-Type': type || 'application/octet-stream',
    'Cache-Control': 'private, max-age=86400',
  };
  if (filename) headers['Content-Disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(filename)}`;
  return new NextResponse(body, { headers });
}
