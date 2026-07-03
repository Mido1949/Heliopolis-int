-- Source-of-truth: codify the LIVE RLS policies on `leads` into the repo.
--
-- Background: the committed repo migrations were stale. The production DB
-- (project wrmqrvqixtrasajjfbge) had two extra policies added out-of-band
-- (~commit b79b530) that grant org-wide SELECT and, via the FOR ALL
-- org_isolation policy, org-wide UPDATE. This file makes the repo match prod.
--
-- This migration is IDEMPOTENT and NON-BEHAVIORAL: it drops-if-exists and
-- recreates the exact policies already live, so running it changes nothing.
-- It exists so `supabase/migrations` is the source of truth again.
--
-- Verified against a live pg_policy dump on 2026-07-03
-- (see specs/005-crm-productivity/contracts/live-rls-leads.sql).

alter table leads enable row level security;

drop policy if exists org_isolation_leads on leads;
create policy org_isolation_leads on leads
  as permissive for all
  using (is_super_admin() or (org_id = get_user_org_id()))
  with check (is_super_admin() or (org_id = get_user_org_id()));

drop policy if exists leads_select on leads;
create policy leads_select on leads
  as permissive for select
  using (
    (exists (select 1 from profiles
             where profiles.id = auth.uid()
               and profiles.role = any (array['admin','Manager','CS Team Leader','Tech Team Leader'])))
    or (assigned_to_user = auth.uid())
    or (assigned_to = auth.uid())
  );

-- Org-wide visibility: required so every team member can see and claim
-- unassigned NEW leads (the manual collaborative model).
drop policy if exists leads_select_all on leads;
create policy leads_select_all on leads
  as permissive for select
  using (true);

drop policy if exists leads_insert on leads;
create policy leads_insert on leads
  as permissive for insert
  with check (auth.uid() is not null);

drop policy if exists leads_update on leads;
create policy leads_update on leads
  as permissive for update
  using (
    (exists (select 1 from profiles
             where profiles.id = auth.uid()
               and profiles.role = any (array['admin','Manager','CS Team Leader','Tech Team Leader'])))
    or (assigned_to_user = auth.uid())
    or (assigned_to = auth.uid())
  );

drop policy if exists leads_delete on leads;
create policy leads_delete on leads
  as permissive for delete
  using (exists (select 1 from profiles
                 where profiles.id = auth.uid()
                   and profiles.role = any (array['admin','Manager'])));

-- KNOWN CAVEAT (future hardening, tracked in specs/005 US1/T011):
--   * leads_select_all USING(true) ignores org_id → would leak across orgs
--     in a multi-org future. Single-org today, so acceptable.
--   * org_isolation_leads FOR ALL makes UPDATE org-wide (owner/leader check in
--     leads_update is moot). Loose for accountability; tighten later behind
--     explicit claim/assign flows. NOT a launch blocker.
