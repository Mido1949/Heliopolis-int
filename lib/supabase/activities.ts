import { createClient } from './client';

export type ActivityType = 'status_change' | 'note_added' | 'edit' | 'creation' | 'call' | 'note' | 'assignment';

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
