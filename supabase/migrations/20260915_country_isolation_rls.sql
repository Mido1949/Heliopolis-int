-- Country isolation, enforced in the database.
--
-- The app reads leads/calls/BOQs/tasks/activities from 186 places across 44
-- files. Adding a `.eq('country', …)` to each one would separate the two
-- markets only for as long as nobody forgets, and every new query would be a
-- fresh chance to leak Egyptian data into the Saudi book or the reverse.
--
-- So the boundary lives here instead, as RESTRICTIVE policies — the same shape
-- `org_isolation_leads` already uses. RESTRICTIVE matters: Postgres ORs
-- PERMISSIVE policies together, so a permissive one would be an alternate
-- grant rather than a boundary. These are AND-ed onto whatever else applies.
--
-- Admins, Managers and platform admins see both markets; everyone else sees
-- only the market on their profile. The service role bypasses RLS entirely, so
-- crons and report routes are unaffected and must scope by country themselves.

create or replace function public.current_user_country()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.country from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.current_user_sees_all_countries()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           (select p.role in ('admin', 'Manager') from public.profiles p where p.id = auth.uid()),
           false
         )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
$$;

-- leads -----------------------------------------------------------------------
drop policy if exists country_isolation_leads on public.leads;
create policy country_isolation_leads on public.leads
  as restrictive for all
  using (
    public.current_user_sees_all_countries()
    or country = coalesce(public.current_user_country(), 'EG')
  )
  with check (
    public.current_user_sees_all_countries()
    or country = coalesce(public.current_user_country(), 'EG')
  );

-- call_logs -------------------------------------------------------------------
drop policy if exists country_isolation_call_logs on public.call_logs;
create policy country_isolation_call_logs on public.call_logs
  as restrictive for all
  using (
    public.current_user_sees_all_countries()
    or country = coalesce(public.current_user_country(), 'EG')
  )
  with check (
    public.current_user_sees_all_countries()
    or country = coalesce(public.current_user_country(), 'EG')
  );

-- boqs ------------------------------------------------------------------------
drop policy if exists country_isolation_boqs on public.boqs;
create policy country_isolation_boqs on public.boqs
  as restrictive for all
  using (
    public.current_user_sees_all_countries()
    or country = coalesce(public.current_user_country(), 'EG')
  )
  with check (
    public.current_user_sees_all_countries()
    or country = coalesce(public.current_user_country(), 'EG')
  );

-- tasks -----------------------------------------------------------------------
drop policy if exists country_isolation_tasks on public.tasks;
create policy country_isolation_tasks on public.tasks
  as restrictive for all
  using (
    public.current_user_sees_all_countries()
    or country = coalesce(public.current_user_country(), 'EG')
  )
  with check (
    public.current_user_sees_all_countries()
    or country = coalesce(public.current_user_country(), 'EG')
  );

-- lead_activities -------------------------------------------------------------
drop policy if exists country_isolation_lead_activities on public.lead_activities;
create policy country_isolation_lead_activities on public.lead_activities
  as restrictive for all
  using (
    public.current_user_sees_all_countries()
    or country = coalesce(public.current_user_country(), 'EG')
  )
  with check (
    public.current_user_sees_all_countries()
    or country = coalesce(public.current_user_country(), 'EG')
  );
