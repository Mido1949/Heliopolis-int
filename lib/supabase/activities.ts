import { createClient } from './client';

export type ActivityType = 'status_change' | 'note_added' | 'edit' | 'creation';

export async function logLeadActivity(
  leadId: string,
  type: ActivityType,
  details: Record<string, unknown> = {}
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase.from('lead_activities').insert({
    lead_id: leadId,
    user_id: user.id,
    type,
    details,
  });

  if (error) {
    console.error('Failed to log activity:', error);
  }
}
