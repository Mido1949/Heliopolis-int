-- Field visits with GPS check-in/out. Built for the Saudi team, who sell by
-- visiting sites rather than over the phone, but not restricted to them.
--
-- Coordinates are captured from the browser's Geolocation API at the moment
-- the rep taps check-in, together with the accuracy the device reported, so a
-- 2km-accurate fix is never mistaken for proof of presence.

create table if not exists public.field_visits (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid references public.leads(id) on delete set null,
  user_id           uuid not null references auth.users(id) on delete cascade,
  org_id            uuid,
  country           text,

  purpose           text,
  status            text not null default 'in_progress'
                      check (status in ('in_progress','completed','cancelled')),

  check_in_at       timestamptz not null default now(),
  check_in_lat      double precision,
  check_in_lng      double precision,
  -- Metres, as reported by the device. Null means the fix had no accuracy.
  check_in_accuracy double precision,
  check_in_address  text,

  check_out_at      timestamptz,
  check_out_lat     double precision,
  check_out_lng     double precision,

  outcome           text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists field_visits_user_idx    on public.field_visits (user_id, check_in_at desc);
create index if not exists field_visits_lead_idx    on public.field_visits (lead_id);
create index if not exists field_visits_country_idx on public.field_visits (country, check_in_at desc);
-- One open visit per person is the rule the UI relies on to know whether to
-- show "check in" or "check out".
create unique index if not exists field_visits_one_open_per_user
  on public.field_visits (user_id) where status = 'in_progress';

alter table public.field_visits enable row level security;

-- Same stamping rule as every other record table: inherit the lead's market,
-- else the visitor's own.
create or replace function public.stamp_visit_country()
returns trigger language plpgsql security definer set search_path = public as $$
declare lead_country text; lead_org uuid;
begin
  if new.lead_id is not null then
    select l.country, l.org_id into lead_country, lead_org from public.leads l where l.id = new.lead_id;
  end if;
  new.country := coalesce(new.country, lead_country,
                          (select p.country from public.profiles p where p.id = new.user_id), 'EG');
  new.org_id  := coalesce(new.org_id, lead_org,
                          (select p.org_id from public.profiles p where p.id = new.user_id));
  return new;
end $$;

drop trigger if exists field_visits_stamp on public.field_visits;
create trigger field_visits_stamp
  before insert on public.field_visits
  for each row execute function public.stamp_visit_country();

-- A rep manages their own visits; leaders and admins read their market's.
drop policy if exists field_visits_select on public.field_visits;
create policy field_visits_select on public.field_visits for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role in ('admin','Manager','CS Team Leader','Tech Team Leader')
    )
  );

drop policy if exists field_visits_insert on public.field_visits;
create policy field_visits_insert on public.field_visits for insert
  with check (user_id = auth.uid());

drop policy if exists field_visits_update on public.field_visits;
create policy field_visits_update on public.field_visits for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Country isolation, matching the other record tables.
drop policy if exists country_isolation_field_visits on public.field_visits;
create policy country_isolation_field_visits on public.field_visits
  as restrictive for all
  using (public.current_user_sees_all_countries() or country = coalesce(public.current_user_country(), 'EG'))
  with check (public.current_user_sees_all_countries() or country = coalesce(public.current_user_country(), 'EG'));
