import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const boqId = searchParams.get('id');
  const boqNumber = searchParams.get('number') || 'Unknown';

  if (!boqId) {
    return new Response('Missing BOQ ID', { status: 400 });
  }

  const { data: boq, error: boqErr } = await supabase
    .from('boqs')
    .select('id')
    .eq('id', boqId)
    .single();

  if (boqErr || !boq) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const pdfBytes = Buffer.from('PDF Content Placeholder');

  return new Response(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="BOQ-${boqNumber}.pdf"`,
    },
  });
}
