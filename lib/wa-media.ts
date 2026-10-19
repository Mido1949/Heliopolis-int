import { createClient as createAdmin } from '@supabase/supabase-js';

const BUCKET = 'wa-media';
const D360 = 'https://waba-v2.360dialog.io';

function admin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Copy a WhatsApp file from Meta (through 360dialog) into the private wa-media
 * bucket, keyed by its media id. Meta deletes media after about 30 days, and
 * fetching it on every view made recordings and files crawl. The webhook calls
 * this as soon as a message lands; the media route falls back to it for files
 * that arrived before that. Returns false when Meta no longer has the file.
 */
export async function cacheMedia(mediaId: string, fallbackType?: string): Promise<{ ok: boolean; status?: number }> {
  const apiKey = process.env.D360_API_KEY;
  if (!apiKey) return { ok: false, status: 503 };

  // 360dialog proxies Meta's media host: same path, their host, their key.
  const info = await fetch(`${D360}/${mediaId}`, { headers: { 'D360-API-KEY': apiKey } });
  const { url, mime_type } = (await info.json().catch(() => ({}))) as { url?: string; mime_type?: string };
  if (!info.ok || !url) return { ok: false, status: 410 };

  const file = await fetch(url.replace('https://lookaside.fbsbx.com', D360), { headers: { 'D360-API-KEY': apiKey } });
  if (!file.ok) {
    console.error('[wa-media] download failed', mediaId, file.status);
    return { ok: false, status: 502 };
  }
  const type = mime_type || fallbackType || file.headers.get('content-type') || 'application/octet-stream';
  const { error } = await admin()
    .storage.from(BUCKET)
    .upload(mediaId, new Blob([await file.arrayBuffer()], { type }), { contentType: type, upsert: true });
  if (error) {
    console.error('[wa-media] cache upload failed', mediaId, error);
    return { ok: false, status: 502 };
  }
  return { ok: true };
}

/**
 * A short-lived link straight to the cached file, or null if it isn't cached.
 * Supabase serves it with byte ranges, so voice notes and videos start at once
 * instead of streaming the whole file through a Vercel function per request.
 */
export async function signedMediaUrl(mediaId: string, download?: string): Promise<string | null> {
  const { data, error } = await admin()
    .storage.from(BUCKET)
    .createSignedUrl(mediaId, 60 * 60, download ? { download } : undefined);
  return error || !data ? null : data.signedUrl;
}
