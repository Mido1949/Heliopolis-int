import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export interface PushPayload {
  title: string;
  body: string;
  /** Where clicking the notification should land. */
  url?: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  type?: string;
}

let configured = false;

/** Configure web-push once per process; returns false when keys are absent. */
function ensureConfigured(): boolean {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:sales@heliomax.com';

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Send a push to every device one user has registered.
 *
 * Never throws: a push failing must not roll back the in-app notification that
 * triggered it. Subscriptions the push service reports as gone (404/410) are
 * deleted, which is the only way dead devices ever leave the table.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error || !subs || subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.warn('[push] send failed', status, (err as Error)?.message);
        }
      }
    }),
  );

  return sent;
}

/** Fan out one payload to several users. Returns the total devices reached. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  const counts = await Promise.all(userIds.map(id => sendPushToUser(id, payload)));
  return counts.reduce((a, b) => a + b, 0);
}
