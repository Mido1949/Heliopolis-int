-- 2026-10-20 — Mido: every rep sees only their own leads, chats, tasks and
-- quotes; Mido and Ragaa keep full access. Unassigned leads stay a shared pool
-- (whoever replies first owns the lead).
--
-- Every Egypt account was role 'admin', so leads_select let everyone see
-- everything. Reps move to 'Sales Engineer'; the existing lead and chat
-- policies then already scope them. Tasks and quotes also had a PERMISSIVE
-- org-wide policy (and boqs a blanket `true`), which ORs over the per-user
-- rules, so those become RESTRICTIVE.

-- 1. Roles
update profiles
set role = 'Sales Engineer'
where country = 'EG'
  and role = 'admin'
  and id not in (
    '55430c28-2445-44b1-bf6e-08756c87380e', -- Mido
    '45ac0cfd-d162-457b-b600-e85c4dad5bf0'  -- Ragaa
  );

-- 2. Tasks: org scope must narrow, not widen
drop policy org_isolation_tasks on tasks;
create policy org_isolation_tasks on tasks as restrictive for all
  using (is_super_admin() or org_id = get_user_org_id())
  with check (is_super_admin() or org_id = get_user_org_id());

-- 3. Quotes: own quotes, or any quote on a lead the rep can see
drop policy if exists boqs_select_all on boqs;
drop policy if exists "admin sees all boqs" on boqs;
drop policy if exists "user sees own boqs" on boqs;
drop policy org_isolation_boqs on boqs;
create policy org_isolation_boqs on boqs as restrictive for all
  using (is_super_admin() or org_id = get_user_org_id())
  with check (is_super_admin() or org_id = get_user_org_id());
create policy boqs_select_via_lead on boqs for select
  using (lead_id is not null and exists (select 1 from leads l where l.id = boqs.lead_id));
