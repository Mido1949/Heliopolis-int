import { createClient } from '@supabase/supabase-js';

export interface CreateAutoCallTaskParams {
  leadId: string;
  leadName: string;
  assignedTo: string;
  orgId?: string | null;
  createdBy: string;
}

/**
 * T014: Auto-create a "اتصل بـ {name}" task for newly-saved leads.
 * Idempotent — checks for an existing system call task on the lead first.
 * Never throws — task creation failure must not block lead save.
 */
export async function createAutoCallTask(params: CreateAutoCallTaskParams): Promise<void> {
  try {
    const { leadId, leadName, assignedTo, createdBy } = params;

    if (!leadId || !assignedTo || !createdBy) return;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Idempotency guard: skip if an auto-created non-cancelled task exists for this lead
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('lead_id', leadId)
      .eq('auto_created', true)
      .neq('status', 'cancelled')
      .limit(1);

    if (existing && existing.length > 0) return;

    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from('tasks').insert({
      title: `اتصل بـ ${leadName}`,
      assigned_to: assignedTo,
      created_by: createdBy,
      lead_id: leadId,
      due_date: today,
      status: 'pending',
      priority: 'medium',
      auto_created: true,
    });

    if (error) {
      console.warn('[createAutoCallTask] insert failed:', error.message);
    }
  } catch (err) {
    console.warn('[createAutoCallTask] swallowed error:', err);
  }
}
