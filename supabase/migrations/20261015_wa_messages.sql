-- WhatsApp messages, one row per message, attached to the lead it belongs to.
--
-- Omni-channel step 1: every WhatsApp conversation on the team's numbers lands
-- in the CRM. Messages arrive from the Cloud API webhook (directly from Meta or
-- relayed by 360dialog — same payload) in three shapes:
--   messages            → the customer wrote to us
--   smb_message_echoes  → a rep replied from the WhatsApp Business app / Web
--                         (Coexistence), so the CRM sees both sides
--   history             → the one-time 180-day backfill after onboarding
--
-- lead_id is nullable on purpose: an echo or history message for a number that
-- is not a lead yet is kept, and adopted by the lead when one is created for
-- that phone (see adopt_wa_messages below), so nothing is dropped.

create table if not exists public.wa_messages (
  id              uuid primary key default gen_random_uuid(),
  wamid           text not null unique,          -- WhatsApp message id, dedupe key
  lead_id         uuid references public.leads(id) on delete set null,
  business_phone  text not null,                 -- our number, E.164 digits
  phone_number_id text,                          -- Cloud API id of our number
  customer_phone  text not null,                 -- normalized E.164 digits
  direction       text not null check (direction in ('in', 'out')),
  origin          text not null check (origin in ('customer', 'app', 'api', 'history')),
  msg_type        text not null default 'text',
  body            text,
  media_id        text,
  referral        jsonb,                         -- Click-to-WhatsApp ad that started it
  status          text,                          -- sent / delivered / read / failed (outbound)
  sent_at         timestamptz not null,
  country         text not null check (country in ('EG', 'SA')),
  raw             jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists wa_messages_lead_idx     on public.wa_messages (lead_id, sent_at);
create index if not exists wa_messages_customer_idx on public.wa_messages (customer_phone, sent_at);
create index if not exists wa_messages_orphan_idx   on public.wa_messages (customer_phone) where lead_id is null;

-- Reads go through the lead: if RLS lets you see the lead (org + country
-- isolation), you see its conversation. Writes come only from the webhook,
-- which uses the service role and bypasses RLS — no insert policy is granted.
alter table public.wa_messages enable row level security;

drop policy if exists wa_messages_read_via_lead on public.wa_messages;
create policy wa_messages_read_via_lead on public.wa_messages
  for select to authenticated
  using (
    lead_id is not null
    and exists (select 1 from public.leads l where l.id = wa_messages.lead_id)
  );

-- When a lead is created for a phone that already has unattached messages
-- (a rep chatted first, or history arrived before the customer wrote again),
-- hand those messages to the new lead.
create or replace function public.adopt_wa_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone_normalized is not null then
    update public.wa_messages
       set lead_id = new.id
     where lead_id is null
       and customer_phone = new.phone_normalized;
  end if;
  return new;
end $$;

drop trigger if exists leads_adopt_wa_messages on public.leads;
create trigger leads_adopt_wa_messages
  after insert or update of phone_normalized on public.leads
  for each row execute function public.adopt_wa_messages();

-- Live updates in the lead drawer (WhatsAppThread subscribes to inserts).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wa_messages'
  ) then
    alter publication supabase_realtime add table public.wa_messages;
  end if;
end $$;
