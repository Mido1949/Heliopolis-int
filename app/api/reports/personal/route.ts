import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const date = dateParam || new Date().toISOString().slice(0, 10);
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const userId = user.id;

  // Parallel queries
  const [
    { count: callsMade },
    { count: leadsEntered },
    { count: leadsAssigned },
    { count: boqsCreated },
    { data: wonLeads },
    { data: lostLeads },
    { data: followUpLeads },
  ] = await Promise.all([
    supabase.from('call_logs').select('*', { count: 'exact', head: true })
      .eq('created_by', userId).gte('created_at', dayStart).lte('created_at', dayEnd),
    supabase.from('leads').select('*', { count: 'exact', head: true })
      .eq('created_by', userId).gte('created_at', dayStart).lte('created_at', dayEnd),
    supabase.from('leads').select('*', { count: 'exact', head: true })
      .eq('assigned_to_user', userId).gte('created_at', dayStart).lte('created_at', dayEnd),
    supabase.from('boqs').select('*', { count: 'exact', head: true })
      .eq('created_by', userId).gte('created_at', dayStart).lte('created_at', dayEnd),
    supabase.from('leads').select('id, name, deal_value')
      .eq('assigned_to_user', userId).eq('pipeline_stage', 'WON')
      .gte('updated_at', dayStart).lte('updated_at', dayEnd),
    supabase.from('leads').select('*', { count: 'exact', head: true })
      .eq('assigned_to_user', userId).eq('pipeline_stage', 'LOST')
      .gte('updated_at', dayStart).lte('updated_at', dayEnd),
    supabase.from('leads').select('*', { count: 'exact', head: true })
      .eq('assigned_to_user', userId).eq('pipeline_stage', 'NEGOTIATION')
      .gte('updated_at', dayStart).lte('updated_at', dayEnd),
  ]);

  return NextResponse.json({
    user_id: userId,
    date,
    activity: {
      calls_made: callsMade || 0,
      leads_entered: leadsEntered || 0,
      leads_assigned: leadsAssigned || 0,
      boqs_created: boqsCreated || 0,
    },
    outcomes: {
      won: (wonLeads || []).map((l: { id: string; name: string; deal_value: number | null }) => ({
        lead_id: l.id,
        name: l.name,
        deal_value: l.deal_value,
      })),
      lost_price: lostLeads?.length || 0,
      follow_up: followUpLeads?.length || 0,
    },
  });
}
