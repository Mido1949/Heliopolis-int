-- Record which website segment and stage a WhatsApp lead came from (2026-11-02).
-- The site appends a tag to every WhatsApp prefill:
--   new  [hm-{villa|proj|con|apt|gen}-{pre|fin|done|na}-{section}-{locale}[-{src}]]
--   old  [hm-{home|proj|gen}-{section}-{locale}[-{src}]]   (before the segment funnel)
-- A trigger reads it from the customer's message and fills the lead. First tag wins,
-- the same rule as the ad attribution. No CHECK constraints on purpose: a value the
-- app does not expect must never block a lead from saving.

alter table public.leads
  add column if not exists site_segment  text,        -- villa | proj | con | apt | gen
  add column if not exists site_stage    text,        -- pre | fin | done (null = not asked)
  add column if not exists site_ref      text,        -- the raw tag, keeps section/locale/source
  add column if not exists site_first_at timestamptz;

comment on column public.leads.site_segment is 'Website segment from the [hm-] WhatsApp tag: villa, proj, con, apt, gen';
comment on column public.leads.site_stage   is 'Finishing stage from the [hm-] tag: pre, fin, done; null when not asked';

create index if not exists leads_site_segment_idx on public.leads (site_segment) where site_segment is not null;

-- Parse a message body into (segment, stage, tag). Returns no row when there is no tag.
create or replace function public.parse_site_ref(body text)
returns table (segment text, stage text, tag text)
language sql
immutable
as $$
  with t as (select substring(body from '\[(hm-[a-z0-9-]+)\]') as tag)
  select case p[2]
           when 'home'  then 'villa'
           when 'villa' then 'villa'
           when 'proj'  then 'proj'
           when 'con'   then 'con'
           when 'apt'   then 'apt'
           when 'gen'   then 'gen'
         end,
         case when p[3] in ('pre', 'fin', 'done') then p[3] end,
         t.tag
    from t, lateral (select string_to_array(t.tag, '-') as p) a
   where t.tag is not null
$$;

create or replace function public.wa_message_attribute_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.lead_id is not null and new.direction = 'in' and new.body like '%[hm-%' then
    select * into r from public.parse_site_ref(new.body);
    if r.segment is not null then
      update public.leads
         set site_segment  = r.segment,
             site_stage    = r.stage,
             site_ref      = r.tag,
             site_first_at = coalesce(new.sent_at, new.created_at)
       where id = new.lead_id
         and site_segment is null;
    end if;
  end if;
  return new;
end;
$$;

-- Fires on insert and when a message is adopted by a lead later (lead_id set).
drop trigger if exists wa_messages_attribute_site on public.wa_messages;
create trigger wa_messages_attribute_site
  after insert or update of lead_id on public.wa_messages
  for each row execute function public.wa_message_attribute_site();

-- Backfill: earliest tagged customer message per lead.
update public.leads l
   set site_segment  = f.segment,
       site_stage    = f.stage,
       site_ref      = f.tag,
       site_first_at = f.at
  from (
    select distinct on (m.lead_id)
           m.lead_id, s.segment, s.stage, s.tag, coalesce(m.sent_at, m.created_at) as at
      from public.wa_messages m
      cross join lateral public.parse_site_ref(m.body) s
     where m.lead_id is not null
       and m.direction = 'in'
       and m.body like '%[hm-%'
       and s.segment is not null
     order by m.lead_id, coalesce(m.sent_at, m.created_at)
  ) f
 where l.id = f.lead_id
   and l.site_segment is null;
