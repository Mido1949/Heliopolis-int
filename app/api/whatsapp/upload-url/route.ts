import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'wa-media';

/**
 * POST { leadId, filename } — a one-time signed upload slot in the private
 * wa-media bucket, for a file a rep is about to send on WhatsApp.
 *
 * The browser uploads straight to Storage because Vercel caps a function's
 * request body at 4.5 MB; /api/whatsapp/send then picks the file up from
 * there. The lead is read with the rep's own session, so RLS decides who may
 * send to whom.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { leadId?: string; filename?: string };
  if (!body.leadId) return NextResponse.json({ error: 'leadId مطلوب' }, { status: 400 });

  const { data: lead } = await supabase.from('leads').select('id').eq('id', body.leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'الليد مش موجود' }, { status: 404 });

  // Storage keys must be ASCII; the real filename travels separately to /send.
  const ext = (body.filename?.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? 'bin').toLowerCase();
  const path = `outgoing/${user.id}/${crypto.randomUUID()}.${ext}`;

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[wa-upload-url]', error);
    return NextResponse.json({ error: 'تعذّر تجهيز رفع الملف' }, { status: 500 });
  }
  return NextResponse.json({ path, token: data.token });
}
