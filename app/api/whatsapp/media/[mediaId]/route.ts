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
  if (cached.data) return send(request, cached.data, cached.data.type || meta.mime_type, meta.filename);

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

  return send(request, blob, type, meta.filename);
}

// Audio and video players need byte ranges (206) to read the duration and
// play; a plain 200 leaves the player stuck at 0:00.
// Only what a browser can show opens in the tab. Anything else (DWG, RAR,
// ZIP…) downloads, so the rep opens it in AutoCAD / WinRAR. Customers' phones
// label DWG as "image/vnd.dwg", which a browser tries to draw and shows broken.
function viewable(type: string): boolean {
  return /^(image\/(jpeg|png|gif|webp)|video\/|audio\/|application\/pdf|text\/plain)/.test(type);
}

async function send(request: Request, body: Blob, type: string | undefined, filename: string | undefined) {
  const buf = Buffer.from(await body.arrayBuffer());
  const size = buf.length;
  const inline = viewable(type || '');
  const headers: Record<string, string> = {
    'Content-Type': inline ? type! : 'application/octet-stream',
    'Cache-Control': 'private, max-age=86400',
    'Accept-Ranges': 'bytes',
  };
  if (filename || !inline) {
    const name = filename ? `; filename*=UTF-8''${encodeURIComponent(filename)}` : '';
    headers['Content-Disposition'] = `${inline ? 'inline' : 'attachment'}${name}`;
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    // "bytes=-500" means the last 500 bytes.
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    start = Math.max(0, start);
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    headers['Content-Length'] = String(end - start + 1);
    return new NextResponse(new Uint8Array(buf.subarray(start, end + 1)), { status: 206, headers });
  }
  headers['Content-Length'] = String(size);
  return new NextResponse(new Uint8Array(buf), { headers });
}
