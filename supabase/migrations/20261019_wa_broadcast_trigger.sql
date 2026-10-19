-- Live WhatsApp updates via Realtime Broadcast instead of postgres_changes.
-- postgres_changes made Realtime poll the WAL and RLS-check every change for
-- every open screen — 4M+ queries that exhausted the Nano compute (2026-10-19).
-- Clients only get a lead_id nudge and refetch through RLS.

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create or replace function public.wa_messages_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform realtime.send(jsonb_build_object('lead_id', new.lead_id), 'wa_insert', 'wa-inbox', false);
  end if;
  perform realtime.send(jsonb_build_object('lead_id', new.lead_id), 'wa_change', 'wa-lead:' || new.lead_id, false);
  return null;
exception when others then
  -- never block storing a message because a broadcast failed
  return null;
end;
$$;

drop trigger if exists wa_messages_broadcast on public.wa_messages;
create trigger wa_messages_broadcast
  after insert or update on public.wa_messages
  for each row execute function public.wa_messages_broadcast();
