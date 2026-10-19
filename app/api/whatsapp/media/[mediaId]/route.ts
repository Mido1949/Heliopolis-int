import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cacheMedia, signedMediaUrl } from '@/lib/wa-media';

export const dynamic = 'force-dynamic';

// Only what a browser can show opens in the tab. Anything else (DWG, RAR,
// ZIP…) downloads, so the rep opens it in AutoCAD / WinRAR. Customers' phones
// label DWG as "image/vnd.dwg", which a browser tries to draw and shows broken.
function viewable(type: string): boolean {
  return /^(image\/(jpeg|png|gif|webp)|video\/|audio\/|application\/pdf|text\/plain)/.test(type);
}

/**
 * GET — a WhatsApp photo, voice note, video or file, for the CRM thread.
 *
 * The message is looked up with the viewer's own session, so lead RLS decides
 * who may open it. The file itself is served by Supabase Storage through a
 * signed redirect; a file the webhook hasn't cached yet is copied from Meta
 * first (see lib/wa-media.ts).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
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
  const download = viewable(meta.mime_type || '') ? undefined : meta.filename || `${mediaId}`;

  let url = await signedMediaUrl(mediaId, download);
  if (!url) {
    const cached = await cacheMedia(mediaId, meta.mime_type);
    if (!cached.ok) {
      const error = cached.status === 410 ? 'الملف مش متاح عند واتساب (ممكن يكون اتمسح بعد 30 يوم)' : 'تعذّر تحميل الملف';
      return NextResponse.json({ error }, { status: cached.status ?? 502 });
    }
    url = await signedMediaUrl(mediaId, download);
    if (!url) return NextResponse.json({ error: 'تعذّر تحميل الملف' }, { status: 502 });
  }

  // The signed link lives an hour; let the browser reuse the redirect for most of it.
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, max-age=3000' } });
}
