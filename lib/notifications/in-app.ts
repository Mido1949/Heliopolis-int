import { createClient } from '@supabase/supabase-js';

interface NotificationMeta {
  type: string;
  data?: Record<string, unknown>;
}

/**
 * In-app notification writer. Uses service role so it can write notifications
 * for any user regardless of calling context (route handlers, cron jobs, etc.).
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

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      message,
      lead_id: leadId,
      read: false,
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
