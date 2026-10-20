import { createClient } from '@/lib/supabase/client';

export const LEAD_FILES_BUCKET = 'client-files';

export interface LeadFile {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
  uploaded_by: string | null;
  uploader?: { name: string | null } | null;
}

/**
 * A file a rep attaches to a lead (usually a quote PDF made on their own
 * machine). The browser uploads straight to storage, so large PDFs never pass
 * through a Vercel function (4.5 MB body limit), then records it in
 * client_files with the lead in metadata.lead_id.
 */
export async function uploadLeadFile(file: File, opts: { leadId: string; orgId: string; orgSlug: string; userId: string }) {
  const supabase = createClient();
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const path = `${opts.orgSlug}/quotes/${opts.leadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(LEAD_FILES_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (upErr) throw new Error(`الملف ماترفعش: ${upErr.message}`);

  const { error: dbErr } = await supabase.from('client_files').insert({
    org_id: opts.orgId,
    file_name: file.name,
    file_path: path,
    file_type: ext === 'pdf' ? 'pdf' : file.type.startsWith('image/') ? 'image' : 'document',
    category: 'quote',
    file_size: file.size,
    mime_type: file.type || null,
    uploaded_by: opts.userId,
    metadata: { lead_id: opts.leadId },
  });
  if (dbErr) {
    await supabase.storage.from(LEAD_FILES_BUCKET).remove([path]);
    throw new Error(`الملف ماتسجلش: ${dbErr.message}`);
  }
}

export async function listLeadFiles(leadId: string): Promise<LeadFile[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('client_files')
    .select('id, file_name, file_path, file_size, created_at, uploaded_by')
    .eq('metadata->>lead_id', leadId)
    .order('created_at', { ascending: false });
  const files = (data as LeadFile[] | null) ?? [];
  // uploaded_by points at auth.users, so PostgREST can't embed the profile.
  const ids = Array.from(new Set(files.map((f) => f.uploaded_by).filter(Boolean))) as string[];
  if (!ids.length) return files;
  const { data: people } = await supabase.from('profiles').select('id, name').in('id', ids);
  const names = new Map((people ?? []).map((p) => [p.id as string, p.name as string | null]));
  return files.map((f) => ({ ...f, uploader: { name: f.uploaded_by ? names.get(f.uploaded_by) ?? null : null } }));
}

export async function openLeadFile(path: string) {
  const { data, error } = await createClient().storage.from(LEAD_FILES_BUCKET).createSignedUrl(path, 600);
  if (error || !data) throw new Error('الملف مش متاح');
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

export interface QuoteFileRow extends LeadFile {
  lead_id: string | null;
  lead_name: string | null;
}

/** Latest uploaded quote files, each with its lead's name; `mine` limits to one uploader. */
export async function listRecentQuoteFiles(mine: string | null, limit = 50): Promise<QuoteFileRow[]> {
  const supabase = createClient();
  let q = supabase
    .from('client_files')
    .select('id, file_name, file_path, file_size, created_at, uploaded_by, metadata')
    .eq('category', 'quote')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (mine) q = q.eq('uploaded_by', mine);
  const { data } = await q;
  const rows = ((data ?? []) as (LeadFile & { metadata: { lead_id?: string } | null })[]).map((r) => ({
    ...r,
    lead_id: r.metadata?.lead_id ?? null,
  }));
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter(Boolean))) as string[];
  const userIds = Array.from(new Set(rows.map((r) => r.uploaded_by).filter(Boolean))) as string[];
  const [{ data: leads }, { data: people }] = await Promise.all([
    leadIds.length ? supabase.from('leads').select('id, name').in('id', leadIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from('profiles').select('id, name').in('id', userIds) : Promise.resolve({ data: [] }),
  ]);
  const leadName = new Map(((leads ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
  const userName = new Map(((people ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    id: r.id,
    file_name: r.file_name,
    file_path: r.file_path,
    file_size: r.file_size,
    created_at: r.created_at,
    uploaded_by: r.uploaded_by,
    lead_id: r.lead_id,
    lead_name: r.lead_id ? leadName.get(r.lead_id) ?? null : null,
    uploader: { name: r.uploaded_by ? userName.get(r.uploaded_by) ?? null : null },
  }));
}
