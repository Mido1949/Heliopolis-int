-- Rep data separation (Mido, 2026-11-08): "mona and Reem — each one doesn't see the
-- other's data and can't change anything of the other user".
--
-- What leaked, and why. Postgres ORs PERMISSIVE policies together, so one wide policy
-- beats every narrow one on the same table:
--   call_logs        "Everyone can view call logs" (true), call_logs_select (whole org),
--                    and org_isolation_call_logs PERMISSIVE ALL: any rep could read,
--                    UPDATE and DELETE every call in the org.
--   lead_activities  "Authenticated users can read activities" (true) and
--                    org_isolation_lead_activities PERMISSIVE ALL: same.
--   notifications    org_isolation_notifications PERMISSIVE ALL: a rep could read the
--                    other's "new lead" alerts (customer name + first message).
--   leads            user_has_task_on_lead() opened a lead to anyone who EVER had a task
--                    on it, open or closed: mona still reads 31 of Reem's leads, Reem 8 of
--                    mona's, and through them their WhatsApp threads and BOQs.
--
-- The narrow policies that stay (unchanged) already say the right thing:
--   leads_select / leads_update  own leads, the unassigned pool, admins + team leaders
--   activities_select            admins + leaders, my own entries, entries on my leads
--   call_logs_update / _delete   only the rep who logged the call
--   notifications_select/_update only the recipient
--   tasks_select / tasks_update  own tasks, admins + Manager
--
-- Run in the Supabase SQL editor. Idempotent.

begin;

-- ── call_logs ───────────────────────────────────────────────────────────────
drop policy if exists "Everyone can view call logs" on public.call_logs;
drop policy if exists call_logs_select on public.call_logs;
drop policy if exists "admin sees all calls" on public.call_logs;   -- role 'Admin' never matched
drop policy if exists "user sees own calls" on public.call_logs;    -- folded into the one below

drop policy if exists org_isolation_call_logs on public.call_logs;
create policy org_isolation_call_logs on public.call_logs
  as restrictive for all
  using (is_super_admin() or org_id = get_user_org_id())
  with check (is_super_admin() or org_id = get_user_org_id());

drop policy if exists call_logs_select_scoped on public.call_logs;
create policy call_logs_select_scoped on public.call_logs
  for select using (
    created_by = auth.uid()
    or exists (select 1 from public.leads l
                where l.id = call_logs.lead_id
                  and (l.assigned_to_user = auth.uid() or l.assigned_to = auth.uid()))
    or exists (select 1 from public.profiles p
                where p.id = auth.uid()
                  and p.role in ('admin', 'Manager', 'CS Team Leader', 'Tech Team Leader'))
  );

-- ── lead_activities ─────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can read activities" on public.lead_activities;

drop policy if exists org_isolation_lead_activities on public.lead_activities;
create policy org_isolation_lead_activities on public.lead_activities
  as restrictive for all
  using (is_super_admin() or org_id = get_user_org_id())
  with check (is_super_admin() or org_id = get_user_org_id());

-- ── notifications ───────────────────────────────────────────────────────────
drop policy if exists org_isolation_notifications on public.notifications;
create policy org_isolation_notifications on public.notifications
  as restrictive for all
  using (is_super_admin() or org_id = get_user_org_id())
  with check (is_super_admin() or org_id = get_user_org_id());

-- ── leads reached through a task ────────────────────────────────────────────
-- A task still opens the lead (a tech engineer's site-visit task on a CS lead, say),
-- but never a lead that belongs to ANOTHER member of the CS team.
create or replace function public.user_has_task_on_lead(p_lead_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (select 1 from tasks t
                  where t.lead_id = p_lead_id and t.assigned_to = auth.uid())
     and not exists (select 1 from leads l
                       join profiles o on o.id = l.assigned_to_user
                      where l.id = p_lead_id
                        and o.crm_team = 'cs'
                        and o.id <> auth.uid())
$$;

-- ── asmaa: tech team rep, not admin (Mido, 2026-11-08) ──────────────────────
-- She now sees only her own leads + the pool, and joins the WhatsApp lead rotation
-- (pick_wa_lead_owner: Sales Engineer + tech + EG + signed in within 14 days).
update public.profiles
   set role = 'Sales Engineer', crm_team = 'tech'
 where id = 'dd8b0f71-d7e6-43b6-a598-d207de3ed7ad';

commit;

-- Check after running (expect 0 rows): policies that let anyone read a whole table.
--   select tablename, policyname from pg_policies
--    where schemaname = 'public' and permissive = 'PERMISSIVE'
--      and tablename in ('call_logs','lead_activities','notifications')
--      and (qual = 'true' or policyname like 'org_isolation%');
