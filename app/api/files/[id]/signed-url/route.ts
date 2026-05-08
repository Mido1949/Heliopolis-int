import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const { data: fileRecord } = await supabase
    .from('client_files')
    .select('file_path')
    .eq('id', params.id)
    .single();

  if (!fileRecord) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabase.storage
    .from('client-files')
    .createSignedUrl(fileRecord.file_path, 3600);

  return NextResponse.json({ url: data?.signedUrl ?? null });
}