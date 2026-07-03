-- SOURCE OF TRUTH: live RLS policies on `leads` as dumped from production
-- (project wrmqrvqixtrasajjfbge) on 2026-07-03 via the session pooler.
-- Captured for T003. The committed repo migrations were STALE — these live
-- policies (added ~commit b79b530) already grant org-wide read AND org-wide
-- update, so the manual collaborative model is NOT blocked by RLS.
--
-- RLS: enabled = true, forced = false
--
-- Finding: two SELECT policies coexist (leads_select owner/leader-scoped AND
-- leads_select_all USING true). Because permissive policies OR together,
-- leads_select_all makes SELECT effectively org-wide (actually global — see note).
-- Likewise org_isolation_leads is FOR ALL, so UPDATE is permitted for any org
-- member (owner/leader restriction in leads_update is moot once ORed with it).
--
-- NOTE (future hardening, NOT part of US1): leads_select_all USING(true) ignores
-- org_id, so in a multi-org future it would leak across orgs. Single-org today.
-- Also "everyone can update everything" is loose for accountability (Fable's point);
-- tighten later behind claim/assign flows, but it is NOT a launch blocker.

-- ── ALL ──────────────────────────────────────────────────────────────────────
create policy org_isolation_leads on leads
  as permissive for all
  using (is_super_admin() or (org_id = get_user_org_id()))
  with check (is_super_admin() or (org_id = get_user_org_id()));

-- ── SELECT ───────────────────────────────────────────────────────────────────
create policy leads_select on leads
  as permissive for select
  using (
    (exists (select 1 from profiles
             where profiles.id = auth.uid()
               and profiles.role = any (array['admin','Manager','CS Team Leader','Tech Team Leader'])))
    or (assigned_to_user = auth.uid())
    or (assigned_to = auth.uid())
  );

create policy leads_select_all on leads
  as permissive for select
  using (true);

-- ── INSERT ───────────────────────────────────────────────────────────────────
create policy leads_insert on leads
  as permissive for insert
  with check (auth.uid() is not null);

-- ── UPDATE ───────────────────────────────────────────────────────────────────
create policy leads_update on leads
  as permissive for update
  using (
    (exists (select 1 from profiles
             where profiles.id = auth.uid()
               and profiles.role = any (array['admin','Manager','CS Team Leader','Tech Team Leader'])))
    or (assigned_to_user = auth.uid())
    or (assigned_to = auth.uid())
  );

-- ── DELETE ───────────────────────────────────────────────────────────────────
create policy leads_delete on leads
  as permissive for delete
  using (exists (select 1 from profiles
                 where profiles.id = auth.uid()
                   and profiles.role = any (array['admin','Manager'])));

-- profiles columns relevant to role checks:
--   id uuid, name text, email text, role text, avatar_url text, score int,
--   created_at timestamptz, updated_at timestamptz, team text, crm_team text, org_id uuid
