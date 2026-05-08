import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id, organizations(slug)')
    .eq('user_id', user.id)
    .single();

  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const orgSlug = (membership.organizations as { slug: string }).slug;
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const category = (formData.get('category') as string) ?? 'other';
  const description = (formData.get('description') as string) ?? '';

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext = file.name.split('.').pop();
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const storagePath = `${orgSlug}/${category}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage
    .from('client-files')
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const fileType = ext === 'pdf' ? 'pdf'
    : file.type.startsWith('image/') ? 'image'
    : file.type.startsWith('video/') ? 'video'
    : 'document';

  const { data: fileRecord, error: dbError } = await supabase
    .from('client_files')
    .insert({
      org_id: membership.org_id,
      file_name: file.name,
      file_path: storagePath,
      file_type: fileType,
      category,
      description,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const n8nWebhook = process.env.N8N_FILE_PROCESSOR_WEBHOOK;
  if (n8nWebhook) {
    fetch(n8nWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileRecord.id,
        org_id: membership.org_id,
        file_path: storagePath,
        file_name: file.name,
        file_type: fileType,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ file: fileRecord });
}