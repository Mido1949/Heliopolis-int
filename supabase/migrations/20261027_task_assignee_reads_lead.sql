-- 2026-10-27 (Mido): clicking a task on /tasks opens its lead (details drawer
-- or WhatsApp chat). The CS call tasks sit on other reps' leads, which reps
-- cannot read, so the click had nothing to open. Whoever holds a task on a
-- lead may now read that lead (and, through the existing via-lead policies,
-- its chat and quotes). Writes stay owner/leader only.

create or replace function public.user_has_task_on_lead(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks t
                  where t.lead_id = p_lead_id and t.assigned_to = auth.uid())
$$;

drop policy if exists leads_select_via_task on leads;
create policy leads_select_via_task on leads for select to authenticated
  using (public.user_has_task_on_lead(id));
