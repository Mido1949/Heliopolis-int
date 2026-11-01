-- Link every CRM lead to the Meta ad that started its WhatsApp chat (2026-11-01).
-- The click-to-WhatsApp `referral` only ever landed on wa_messages, so a WON or
-- QUOTED deal could not be traced back to an ad. First ad wins: a lead keeps the
-- ad that brought it in even if the customer later taps a different ad.

alter table public.leads
  add column if not exists ad_source_id text,
  add column if not exists ad_headline  text,
  add column if not exists ad_first_at  timestamptz;

create index if not exists leads_ad_source_id_idx on public.leads (ad_source_id) where ad_source_id is not null;

create or replace function public.wa_message_attribute_ad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is not null
     and new.direction = 'in'
     and new.referral is not null
     and coalesce(new.referral->>'source_id', '') <> '' then
    update public.leads
       set ad_source_id = new.referral->>'source_id',
           ad_headline  = nullif(new.referral->>'headline', ''),
           ad_first_at  = new.created_at
     where id = new.lead_id
       and ad_source_id is null;
  end if;
  return new;
end;
$$;

-- Fires on insert and when a message is adopted by a lead later (lead_id set).
drop trigger if exists wa_messages_attribute_ad on public.wa_messages;
create trigger wa_messages_attribute_ad
  after insert or update of lead_id on public.wa_messages
  for each row execute function public.wa_message_attribute_ad();

-- Backfill: earliest ad message per lead.
update public.leads l
   set ad_source_id = f.source_id,
       ad_headline  = f.headline,
       ad_first_at  = f.created_at
  from (
    select distinct on (lead_id)
           lead_id, referral->>'source_id' as source_id,
           nullif(referral->>'headline', '') as headline, created_at
      from public.wa_messages
     where lead_id is not null and direction = 'in'
       and referral is not null and coalesce(referral->>'source_id', '') <> ''
     order by lead_id, created_at
  ) f
 where l.id = f.lead_id and l.ad_source_id is null;

-- One row per ad: how far its leads got. security_invoker keeps lead RLS.
create or replace view public.ad_lead_funnel
with (security_invoker = true) as
select l.country,
       l.ad_source_id,
       max(l.ad_headline)                                                        as ad_headline,
       min(l.ad_first_at)                                                        as first_lead_at,
       count(*)                                                                  as leads,
       count(*) filter (where l.pipeline_stage in ('FOLLOW_UP','QUOTED','NEGOTIATION','WON')) as engaged,
       count(*) filter (where l.pipeline_stage in ('QUOTED','NEGOTIATION','WON')) as quoted,
       count(*) filter (where l.pipeline_stage = 'WON')                          as won,
       count(*) filter (where l.pipeline_stage = 'LOST')                         as lost,
       sum(l.deal_value) filter (where l.pipeline_stage = 'WON')                 as won_value
  from public.leads l
 where l.ad_source_id is not null
 group by l.country, l.ad_source_id;
