-- Every new notification rings the bell live, whoever inserted it.
-- Since 20261019b dropped notifications from supabase_realtime, only rows
-- written through createNotification() were broadcast; the WhatsApp webhook,
-- Meta webhook, crons and LeadDrawer insert directly and arrived silently.
-- Broadcast (not postgres_changes) keeps the DB free of WAL polling.

create or replace function public.notifications_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(to_jsonb(new), 'new_notification', 'user:' || new.user_id, false);
  return null;
exception when others then
  -- never block a notification because a broadcast failed
  return null;
end;
$$;

drop trigger if exists notifications_broadcast on public.notifications;
create trigger notifications_broadcast
  after insert on public.notifications
  for each row execute function public.notifications_broadcast();
