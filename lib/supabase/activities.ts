import { createClient } from './client';

// Must stay in sync with the DB's lead_activities_type_check constraint —
// a value missing there is rejected at insert time, and most call sites log
// activities fire-and-forget, so the failure is silent.
export type ActivityType =
  | 'status_change' | 'note_added' | 'edit' | 'creation' | 'call' | 'note'
  | 'assignment' | 'next_step_set' | 'next_step_done';

export async function logLeadActivity(
  leadId: string,
  type: ActivityType,
  details: Record<string, unknown> = {}
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return;

  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  const { error } = await supabase.from('lead_activities').insert({
    lead_id: leadId,
    user_id: user.id,
    type,
    details,
    org_id: membership?.org_id ?? null,
  });

  if (error) {
    console.error('Failed to log activity:', error);
  }
}
