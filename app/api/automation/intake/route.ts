import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { intakeLeads, NoCsMembersError } from '@/lib/leads/intake';

interface ScrapedBusiness {
  name?: string;
  phone?: string;
  company?: string;
  email?: string;
  source?: string;
  address?: string;
  category?: string;
  website?: string;
}

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch { /* noop */ }
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch { /* noop */ }
        },
      },
    }
  );

  // Webhook auth via WEBHOOK_SECRET; otherwise require session
  const authHeader = request.headers.get('authorization');
  const expectedWebhookSecret = process.env.WEBHOOK_SECRET;
  const isWebhook = expectedWebhookSecret ? (authHeader === `Bearer ${expectedWebhookSecret}`) : false;
  if (!isWebhook) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: ScrapedBusiness[];
  try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(payload)) return NextResponse.json({ error: 'Expected array' }, { status: 400 });

  try {
    const result = await intakeLeads(payload);
    return NextResponse.json({ created: result.created, duplicates: result.duplicates, errors: result.errors });
  } catch (err) {
    if (err instanceof NoCsMembersError) {
      return NextResponse.json({ error: 'No CS users available' }, { status: 503 });
    }
    throw err;
  }
}
