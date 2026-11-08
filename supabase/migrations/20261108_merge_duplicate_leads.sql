-- Duplicate leads, round 2 (Mido, 2026-11-08: "delete the duplicated leads to all users").
--
-- The 11-01 merge cleaned 54 copies, but 26 more appeared within a week (22 EG numbers,
-- 2 SA). 16 of those 22 numbers had one copy each with two different reps. Two causes:
--   1. Format: the WhatsApp webhook and the app store '2010…', while another writer
--      (outside this repo) stores '+2010…', so the lookup missed the existing lead.
--   2. Race: a customer's first messages arrive together, each webhook call sees
--      "no lead", and each one creates one (8 numbers got 2–5 leads).
--
-- This file:
--   a. canon_phone(): one canonical form, digits only ('+2010…', '010…', '0020…' → '2010…').
--   b. A trigger that applies it on every insert/update, whoever the writer is.
--   c. Backfill of existing rows into that form.
--   d. Merge, same rules as 11-01: keeper = the oldest lead; it takes the most
--      advanced stage, the owner of the most advanced/busiest copy, and everyone's
--      notes; chats, calls, tasks, activities, BOQs and the rest move to the keeper.
--      Copies are ARCHIVED, not deleted, and lead_merges_20261108 keeps each one's
--      full row so a merge can be undone.
--   e. A unique index: two active leads can no longer share a number. The webhook
--      (deployed first) catches the rejection and attaches to the existing lead.
--
-- ORDER: deploy the CRM first (webhook change), THEN run this in the SQL editor.

begin;

-- a. ─────────────────────────────────────────────────────────────────────────
create or replace function public.canon_phone(p text)
returns text language sql immutable as $$
  select case
    when d is null or d = '' then null
    when d like '00%'                      then substr(d, 3)
    when d like '01%'  and length(d) = 11  then '2'   || d       -- 010… EG local
    when d like '05%'  and length(d) = 10  then '966' || substr(d, 2)  -- 05… SA local
    when d like '1%'   and length(d) = 10  then '20'  || d       -- EG, lost the 0
    when d like '5%'   and length(d) = 9   then '966' || d       -- SA, lost the 0
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

-- b. ─────────────────────────────────────────────────────────────────────────
-- Only rewrites a value that is there: merged copies keep phone_normalized = null on
-- purpose (so lookups skip them), and an update must not refill it from `phone`.
create or replace function public.leads_canon_phone()
returns trigger language plpgsql as $$
begin
  if new.phone_normalized is not null then
    new.phone_normalized := public.canon_phone(new.phone_normalized);
  elsif tg_op = 'INSERT' and new.phone is not null then
    new.phone_normalized := public.canon_phone(new.phone);
  end if;
  return new;
end $$;

drop trigger if exists leads_canon_phone on public.leads;
create trigger leads_canon_phone
  before insert or update of phone_normalized on public.leads
  for each row execute function public.leads_canon_phone();

-- c. ─────────────────────────────────────────────────────────────────────────
update public.leads
   set phone_normalized = public.canon_phone(phone_normalized)
 where phone_normalized is not null
   and phone_normalized is distinct from public.canon_phone(phone_normalized);

update public.leads
   set phone_normalized = public.canon_phone(phone)
 where archived_at is null and phone_normalized is null and coalesce(phone, '') <> '';

-- d. ─────────────────────────────────────────────────────────────────────────
create table if not exists public.lead_merges_20261108 (
  keeper_id uuid not null,
  dup_id    uuid not null primary key,
  dup_row   jsonb not null,
  merged_at timestamptz not null default now()
);
alter table public.lead_merges_20261108 enable row level security;

do $$
declare
  g record;
  k public.leads%rowtype;
  b public.leads%rowtype;
  d record;
  rank_of constant jsonb := '{"LOST":0,"NEW":1,"QUOTED":2,"FOLLOW_UP":3,"NEGOTIATION":4,"WON":5}';
begin
  for g in
    select country, phone_normalized from public.leads
     where archived_at is null and coalesce(phone_normalized, '') <> ''
     group by 1, 2 having count(*) > 1
  loop
    select * into k from public.leads
     where country = g.country and archived_at is null and phone_normalized = g.phone_normalized
     order by created_at asc limit 1;

    select l.* into b from public.leads l
     where l.country = g.country and l.archived_at is null and l.phone_normalized = g.phone_normalized
     order by coalesce((rank_of ->> coalesce(l.pipeline_stage, 'NEW'))::int, 1) desc,
              (select count(*) from public.wa_messages w where w.lead_id = l.id) desc,
              l.updated_at desc limit 1;

    if b.id <> k.id and b.assigned_to_user is not null then
      update public.leads set assigned_to_user = b.assigned_to_user,
                              assigned_to_team = coalesce(b.assigned_to_team, assigned_to_team)
       where id = k.id;
    end if;

    if b.id <> k.id
       and coalesce((rank_of ->> coalesce(b.pipeline_stage,'NEW'))::int,1) > coalesce((rank_of ->> coalesce(k.pipeline_stage,'NEW'))::int,1) then
      update public.leads set
        pipeline_stage   = b.pipeline_stage,
        status           = b.status,
        stage_timestamps = coalesce(k.stage_timestamps, '{}'::jsonb) || coalesce(b.stage_timestamps, '{}'::jsonb),
        deal_value       = coalesce(b.deal_value, k.deal_value),
        lost_reason      = b.lost_reason
      where id = k.id;
    end if;

    for d in
      select * from public.leads
       where country = g.country and archived_at is null and phone_normalized = g.phone_normalized and id <> k.id
    loop
      insert into public.lead_merges_20261108 (keeper_id, dup_id, dup_row) values (k.id, d.id, to_jsonb(d));

      update public.leads set
        name  = case when coalesce(nullif(trim(name), ''), 'عميل واتساب') = 'عميل واتساب'
                     then coalesce(nullif(trim(d.name), ''), name) else name end,
        company             = coalesce(nullif(company, ''), d.company),
        email               = coalesce(nullif(email, ''), d.email),
        region              = coalesce(nullif(region, ''), d.region),
        client_type         = coalesce(nullif(client_type, ''), d.client_type),
        project_description = coalesce(nullif(project_description, ''), d.project_description),
        project_capacity    = coalesce(nullif(project_capacity, ''), d.project_capacity),
        deal_value          = coalesce(deal_value, d.deal_value),
        notes = case when coalesce(d.notes, '') = '' or coalesce(notes, '') like '%' || d.notes || '%' then notes
                     else concat_ws(E'\n— مدموج —\n', nullif(notes, ''), d.notes) end,
        updated_at = now()
      where id = k.id;

      update public.wa_messages         set lead_id = k.id          where lead_id = d.id;
      update public.tasks               set lead_id = k.id          where lead_id = d.id;
      update public.lead_activities     set lead_id = k.id          where lead_id = d.id;
      update public.call_logs           set lead_id = k.id          where lead_id = d.id;
      update public.boqs                set lead_id = k.id          where lead_id = d.id;
      update public.field_visits        set lead_id = k.id          where lead_id = d.id;
      update public.wa_bot_runs         set lead_id = k.id          where lead_id = d.id;
      update public.after_sales_service set lead_id = k.id          where lead_id = d.id;
      update public.email_recipients    set lead_id = k.id          where lead_id = d.id;
      update public.scraped_leads       set imported_lead_id = k.id where imported_lead_id = d.id;
      update public.website_inquiries   set imported_lead_id = k.id where imported_lead_id = d.id;
      update public.agent_actions       set target_lead_id = k.id   where target_lead_id = d.id;

      update public.leads set
        archived_at      = now(),
        phone_normalized = null,
        lost_reason      = 'مدموج في ليد أقدم بنفس الرقم ' || k.id::text
      where id = d.id;
    end loop;
  end loop;
end $$;

-- Tasks that followed a copy onto the keeper but belong to the rep who lost the
-- customer would re-open the leak the separation file closes. Close them.
update public.tasks t
   set status = 'cancelled'
  from public.lead_merges_20261108 m
  join public.leads l on l.id = m.keeper_id
 where t.lead_id = m.keeper_id
   and t.status = 'pending'
   and l.assigned_to_user is not null
   and t.assigned_to <> l.assigned_to_user
   and exists (select 1 from public.profiles p where p.id = t.assigned_to and p.crm_team = 'cs');

-- e. ─────────────────────────────────────────────────────────────────────────
create unique index if not exists leads_active_phone_uniq
  on public.leads (country, phone_normalized)
  where archived_at is null and phone_normalized is not null and phone_normalized <> '';

commit;

-- Check after running:
--   select count(*) from public.lead_merges_20261108;           -- expect ~28
--   select count(*) from (select country, phone_normalized from public.leads
--     where archived_at is null and phone_normalized is not null
--     group by 1,2 having count(*) > 1) x;                       -- expect 0
