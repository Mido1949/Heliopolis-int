-- Apply AFTER the broadcast client code is deployed: nothing listens to
-- postgres_changes any more, so stop Realtime decoding these tables' WAL.
alter publication supabase_realtime drop table public.notifications;
alter publication supabase_realtime drop table public.wa_messages;
