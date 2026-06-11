import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { createNotification } from '@/lib/notifications/in-app';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { assigned_to_user?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!('assigned_to_user' in body)) {
    return NextResponse.json({ error: 'assigned_to_user is required' }, { status: 400 });
  }

  const newAssignee = body.assigned_to_user ?? null;

  // Read current lead to detect change
  const { data: current, error: fetchErr } = await supabase
    .from('leads')
    .select('id, name, assigned_to_user')
    .eq('id', params.id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const oldAssignee = (current as { assigned_to_user: string | null }).assigned_to_user ?? null;

  // Update lead
  const { data: updated, error: updErr } = await supabase
    .from('leads')
    .update({ assigned_to_user: newAssignee, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, name, assigned_to_user')
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  // Side effect: notify new assignee (if changed and not null)
  if (newAssignee && newAssignee !== oldAssignee) {
    try {
      await createNotification(
        newAssignee,
        `📋 تم تحويل ${(current as { name: string }).name} إليك`,
        params.id
      );
    } catch (err) {
      console.error('[leads/[id] PATCH] notification failed:', err);
    }
  }

  return NextResponse.json(updated);
}
