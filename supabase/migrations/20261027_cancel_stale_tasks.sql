-- 2026-10-27 (Mido): a task whose lead is closed (won/lost), deleted, or has
-- moved past the stage the task was for should leave everyone's list. Such
-- tasks become 'cancelled', not 'done', so the daily report and the per-rep
-- "tasks done" counts don't credit work nobody did.

alter table tasks drop constraint tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status = any (array['pending', 'done', 'cancelled']));

create or replace function public.cancel_tasks_on_lead_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pipeline_stage is not distinct from old.pipeline_stage then
    return new;
  end if;

  if new.pipeline_stage in ('WON', 'LOST') then
    update tasks
       set status = 'cancelled', completed_at = now(),
           description = concat_ws(E'\n', description,
             'اتلغت تلقائياً — العميل اتقفل ' || case new.pipeline_stage when 'WON' then 'مكسب' else 'خسارة' end)
     where lead_id = new.id and status = 'pending';
  elsif old.pipeline_stage = 'QUOTED' then
    -- The quote call is only for a lead still waiting at QUOTED. When the call
    -- itself moves it to FOLLOW_UP, close_sibling_call_tasks has already closed
    -- every copy, so this finds nothing.
    update tasks
       set status = 'cancelled', completed_at = now(),
           description = concat_ws(E'\n', description, 'اتلغت تلقائياً — العميل عدّى مرحلة عرض السعر')
     where lead_id = new.id and kind = 'quote_call_1' and status = 'pending';
  end if;
  return new;
end $$;

drop trigger if exists leads_cancel_stale_tasks on leads;
create trigger leads_cancel_stale_tasks
  after update of pipeline_stage on leads
  for each row execute function public.cancel_tasks_on_lead_stage();

-- A deleted lead used to leave its tasks behind with no lead and no phone.
create or replace function public.cancel_tasks_on_lead_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update tasks
     set status = 'cancelled', completed_at = now(),
         description = concat_ws(E'\n', description, 'اتلغت تلقائياً — العميل اتمسح')
   where lead_id = old.id and status = 'pending';
  return old;
end $$;

drop trigger if exists leads_cancel_tasks_on_delete on leads;
create trigger leads_cancel_tasks_on_delete
  before delete on leads
  for each row execute function public.cancel_tasks_on_lead_delete();

-- Backlog: 122 tasks on leads archived as LOST on 2026-10-20, and 149 whose
-- lead was deleted (June–August "first call" tasks plus a few manual ones).
update tasks t
   set status = 'cancelled', completed_at = now(),
       description = concat_ws(E'\n', t.description,
         'اتلغت تلقائياً — العميل اتقفل ' || case l.pipeline_stage when 'WON' then 'مكسب' else 'خسارة' end)
  from leads l
 where l.id = t.lead_id and t.status = 'pending' and l.pipeline_stage in ('WON', 'LOST');

update tasks
   set status = 'cancelled', completed_at = now(),
       description = concat_ws(E'\n', description, 'اتلغت تلقائياً — العميل اتمسح')
 where lead_id is null and status = 'pending';
