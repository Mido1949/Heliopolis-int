import { createClient } from '@supabase/supabase-js';

export interface PersonalReportData {
  user_id: string;
  date: string;
  activity: {
    calls_made: number;
    leads_entered: number;
    leads_assigned: number;
    boqs_created: number;
  };
  outcomes: {
    won: { lead_id: string; name: string; deal_value: number | null }[];
    lost_price: number;
    follow_up: number;
  };
}

/**
 * T062: Aggregate today's activity/outcome data for a single user.
 * Pure server-side function so it can be reused by both the API route and the cron trigger.
 */
export async function getPersonalReportData(userId: string, date: string): Promise<PersonalReportData> {
  // Service-role client (bypasses RLS) — no request/cookies context needed, so
  // this works identically from a cron, a route handler, or anywhere server-side.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const [
    { count: callsMade },
    { count: leadsEntered },
    { count: leadsAssigned },
    { count: boqsCreated },
    { data: wonLeads },
    { count: lostCount },
    { count: followUpCount },
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

  return {
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
      lost_price: lostCount || 0,
      follow_up: followUpCount || 0,
    },
  };
}
