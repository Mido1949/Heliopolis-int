-- Country dimension — separates the Egyptian and Saudi books of business.
--
-- Until now the only thing dividing the two markets was `leads.region IN
-- ('Riyadh','Jeddah')`, applied on exactly one page (/crm-ksa). Every other
-- screen — the Egyptian CRM, My Leads, calls, BOQs, tasks, reports, the
-- command center — read the whole table. And `region` is free-text that users
-- fill in Arabic ('القاهره', 'الاهره', 'مباشر'), so it can never be a reliable
-- boundary.
--
-- `country` is a closed, app-controlled dimension instead. Additive only: new
-- nullable columns, backfilled, then constrained. No existing column changes.

-- 1. Columns -----------------------------------------------------------------
alter table public.leads      add column if not exists country text;
alter table public.call_logs  add column if not exists country text;
alter table public.boqs       add column if not exists country text;
alter table public.tasks      add column if not exists country text;
-- On a profile this is the market the person works in, which decides what they
-- see by default and what country their new records are stamped with.
alter table public.profiles   add column if not exists country text;

-- 2. Backfill ----------------------------------------------------------------
-- Every row today is Egyptian: zero leads carry a Saudi region, so 'EG' is not
-- a guess. The region test is kept anyway so re-running this stays correct.
update public.leads
   set country = case when region in ('Riyadh', 'Jeddah') then 'SA' else 'EG' end
 where country is null;

-- Children inherit from their lead; a BOQ with no lead (22 of 28 are standalone
-- quotes) falls back to Egypt, which is where all of them were written.
update public.call_logs c
   set country = coalesce((select l.country from public.leads l where l.id = c.lead_id), 'EG')
 where c.country is null;

update public.boqs b
   set country = coalesce((select l.country from public.leads l where l.id = b.lead_id), 'EG')
 where b.country is null;

update public.tasks t
   set country = coalesce((select l.country from public.leads l where l.id = t.lead_id), 'EG')
 where t.country is null;

update public.profiles set country = 'EG' where country is null;

-- 3. Constrain ---------------------------------------------------------------
-- Deliberately NO column default on the four record tables. A default is
-- applied before BEFORE INSERT triggers run, so `country text default 'EG'`
-- would mean the stamping triggers below always see 'EG' instead of NULL and
-- their inheritance logic would never fire — every Saudi row would silently
-- land in Egypt. NOT NULL is still safe: it is checked after the trigger.
--
-- profiles is the exception and KEEPS its default: rows there are written by
-- the handle_new_user trigger on auth.users, which knows nothing about this
-- column, so without a default every signup would die on a NOT NULL violation.
alter table public.profiles   alter column country set default 'EG';

alter table public.leads      alter column country set not null;
alter table public.call_logs  alter column country set not null;
alter table public.boqs       alter column country set not null;
alter table public.tasks      alter column country set not null;
alter table public.profiles   alter column country set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_country_check') then
    alter table public.leads add constraint leads_country_check check (country in ('EG','SA'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'call_logs_country_check') then
    alter table public.call_logs add constraint call_logs_country_check check (country in ('EG','SA'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'boqs_country_check') then
    alter table public.boqs add constraint boqs_country_check check (country in ('EG','SA'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_country_check') then
    alter table public.tasks add constraint tasks_country_check check (country in ('EG','SA'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_country_check') then
    alter table public.profiles add constraint profiles_country_check check (country in ('EG','SA'));
  end if;
end $$;

-- 4. Indexes -----------------------------------------------------------------
-- Every list query gains a country predicate, so pair it with what already
-- orders those lists.
create index if not exists leads_country_created_idx     on public.leads (country, created_at desc);
create index if not exists leads_country_stage_idx       on public.leads (country, pipeline_stage);
create index if not exists call_logs_country_created_idx on public.call_logs (country, created_at desc);
create index if not exists boqs_country_created_idx      on public.boqs (country, created_at desc);
create index if not exists tasks_country_status_idx      on public.tasks (country, status);

-- 5. Stamping triggers -------------------------------------------------------
-- The app must never be the only thing that remembers to set country. A call
-- logged against a Saudi lead is Saudi no matter which screen wrote it.
create or replace function public.stamp_country_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_country text;
begin
  if new.lead_id is not null then
    select l.country into lead_country from public.leads l where l.id = new.lead_id;
    if lead_country is not null then
      new.country := lead_country;
      return new;
    end if;
  end if;

  if new.country is null then
    new.country := coalesce(
      (select p.country from public.profiles p where p.id = new.created_by),
      'EG'
    );
  end if;
  return new;
end $$;

drop trigger if exists call_logs_stamp_country on public.call_logs;
create trigger call_logs_stamp_country
  before insert or update of lead_id on public.call_logs
  for each row execute function public.stamp_country_from_lead();

drop trigger if exists boqs_stamp_country on public.boqs;
create trigger boqs_stamp_country
  before insert or update of lead_id on public.boqs
  for each row execute function public.stamp_country_from_lead();

-- tasks.created_by exists but the column the function reads must match, and
-- tasks always carry a lead today; the fallback path uses created_by too.
drop trigger if exists tasks_stamp_country on public.tasks;
create trigger tasks_stamp_country
  before insert or update of lead_id on public.tasks
  for each row execute function public.stamp_country_from_lead();

-- A new lead inherits the market of whoever created it, unless the caller said
-- otherwise. This is what makes Ebtisam's leads Saudi without her doing
-- anything, and keeps the Egyptian team's leads Egyptian.
create or replace function public.stamp_lead_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.country is null then
    new.country := coalesce(
      (select p.country from public.profiles p where p.id = new.created_by),
      case when new.region in ('Riyadh', 'Jeddah') then 'SA' else 'EG' end
    );
  end if;
  return new;
end $$;

drop trigger if exists leads_stamp_country on public.leads;
create trigger leads_stamp_country
  before insert on public.leads
  for each row execute function public.stamp_lead_country();
