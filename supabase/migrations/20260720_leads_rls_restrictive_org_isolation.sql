-- Fix: org_isolation_leads is PERMISSIVE with cmd=ALL and an org-only condition.
-- Postgres ORs all PERMISSIVE policies for a given command together, so this
-- policy alone satisfies SELECT/UPDATE/DELETE for any org member on any lead in
-- the org — silently overriding the narrower role/ownership policies
-- (leads_select, leads_update, leads_delete) that were meant to be the real gate.
-- Converting it to RESTRICTIVE makes it an AND-ed boundary (must be in the right
-- org) rather than an alternate grant, so the narrower policies become the
-- actual access control again. leads_select_all (qual: true) is dropped outright
-- — it was an unconditional SELECT grant with no restriction at all.

drop policy if exists leads_select_all on leads;

drop policy if exists org_isolation_leads on leads;

create policy org_isolation_leads on leads
  as restrictive
  for all
  to public
  using (is_super_admin() or (org_id = get_user_org_id()))
  with check (is_super_admin() or (org_id = get_user_org_id()));
