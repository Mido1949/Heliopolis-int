import { createClient } from '@supabase/supabase-js';

interface NotificationMeta {
  type: string;
  from?: string;
  to_team?: string;
  data?: Record<string, unknown>;
}

const TITLES_BY_TYPE: Record<string, string> = {
  stuck_lead: '⚠️ ليد واقف',
  lead_intake: '🎯 ليد جديد',
  assignment: '📌 تعيين جديد',
  nudge: '⏰ تذكير',
  escalation: '🚩 تصعيد',
  personal_report: '📊 تقريرك اليومي',
  company_report_sent: '📈 تقرير الشركة',
  agent_digest: '🧠 ملخص هيليو',
  scrape_summary: '🔍 ملخص السحب الأسبوعي',
};

/**
 * In-app notification writer. Uses service role so it can write notifications
 * for any user regardless of calling context (route handlers, cron jobs, etc.).
 *
 * Live schema: the production `notifications` table is the multi-tenant shape —
 * `title` (NOT NULL), `body`, `type`, `is_read`, `reference_id`,
 * `reference_type`, and `org_id` (NOT NULL, no default and no trigger), so
 * org_id must be resolved from the recipient's profile before insert.
 */
export async function createNotification(
  userId: string,
  message: string,
  leadId?: string,
  meta?: NotificationMeta
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single();
  if (profErr || !profile?.org_id) {
    throw new Error(`createNotification: recipient ${userId} has no org_id (${profErr?.message || 'profile missing'})`);
  }

  const type = meta?.type || 'general';
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      title: TITLES_BY_TYPE[type] || '🔔 إشعار',
      body: message,
      type,
      reference_id: leadId || null,
      reference_type: leadId ? 'lead' : null,
      is_read: false,
      org_id: profile.org_id,
    })
    .select()
    .single();

  if (error) throw error;

  // Realtime broadcast on user channel
  if (data && supabase.channel) {
    try {
      await supabase.channel(`user:${userId}`).send({
        type: 'broadcast',
        event: 'new_notification',
        payload: { ...data, meta },
      });
    } catch (e) {
      // Non-fatal: notification row already inserted
      console.warn('Realtime broadcast failed:', e);
    }
  }

  return data;
}
