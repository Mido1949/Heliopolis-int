-- Call logging has been dead in production since 2026-07-06.
--
-- `log_call_activity()` fires on every insert into call_logs and writes a
-- lead_activities row, but it never set org_id. Once lead_activities.org_id
-- became NOT NULL the trigger started throwing
--
--   23502  null value in column "org_id" of relation "lead_activities"
--
-- and because it raises inside the trigger, the whole call_logs insert rolls
-- back. The UI reports a generic failure, so nobody traced it: `select
-- max(created_at) from call_logs` returns 2026-07-06 — two months of calls
-- never recorded. Same shape as the 'Meta Ad' constraint that silently blocked
-- every lead save for eight weeks.
--
-- Carry org_id through from the call row, falling back to the lead's own org.
-- Also stamps country so the activity trail splits by market like everything
-- else does.

alter table public.lead_activities add column if not exists country text;

update public.lead_activities a
   set country = coalesce((select l.country from public.leads l where l.id = a.lead_id), 'EG')
 where a.country is null;

alter table public.lead_activities alter column country set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lead_activities_country_check') then
    alter table public.lead_activities
      add constraint lead_activities_country_check check (country in ('EG','SA'));
  end if;
end $$;

create index if not exists lead_activities_country_created_idx
  on public.lead_activities (country, created_at desc);

create or replace function public.log_call_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_org uuid;
  lead_country text;
begin
  select l.org_id, l.country into lead_org, lead_country
    from public.leads l where l.id = new.lead_id;

  insert into public.lead_activities (lead_id, user_id, type, details, org_id, country)
  values (
    new.lead_id,
    new.created_by,
    'note_added',
    jsonb_build_object(
      'action',    'Phone Call',
      'call_type', new.call_type,
      'outcome',   new.outcome,
      'notes',     new.notes
    ),
    coalesce(new.org_id, lead_org),
    coalesce(new.country, lead_country, 'EG')
  );
  return new;
end $$;

-- Any lead_activities row written by something other than this trigger still
-- needs a country; inherit it from the lead the same way.
create or replace function public.stamp_activity_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.country is null then
    new.country := coalesce(
      (select l.country from public.leads l where l.id = new.lead_id),
      'EG'
    );
  end if;
  return new;
end $$;

drop trigger if exists lead_activities_stamp_country on public.lead_activities;
create trigger lead_activities_stamp_country
  before insert on public.lead_activities
  for each row execute function public.stamp_activity_country();
