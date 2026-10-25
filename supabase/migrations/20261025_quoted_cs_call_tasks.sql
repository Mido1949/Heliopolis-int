-- 2026-10-25 (Mido): when a lead becomes QUOTED, by any path (quote upload,
-- BOQ, dragged on the board, or created straight into QUOTED), every CS member
-- gets a call task due in 1 hour. The first one to mark it done closes it for
-- the rest, and gets the follow-up call due 48 hours after the quote.
-- The bell for each task comes from the existing tasks_notify_assignee trigger.

alter table tasks add column if not exists kind text;

create or replace function public.create_quote_call_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pipeline_stage <> 'QUOTED'
     or (tg_op = 'UPDATE' and old.pipeline_stage = 'QUOTED') then
    return new;
  end if;
  if exists (select 1 from tasks
              where lead_id = new.id and kind = 'quote_call_1' and status = 'pending') then
    return new;
  end if;

  -- Reps can only open their own leads, so the phone goes in the task text.
  -- tasks.created_by is NOT NULL: whoever moved the lead, or Mido when a
  -- service-role path did it.
  insert into tasks (title, description, assigned_to, lead_id, due_date,
                     status, priority, org_id, auto_created, kind, created_by)
  select '📞 مكالمة عرض السعر — ' || coalesce(nullif(trim(new.name), ''), 'عميل'),
         concat_ws(E'\n',
           'اتعمل عرض سعر للعميل، كلمه خلال ساعة.',
           'الموبايل: ' || nullif(new.phone, ''),
           'المشروع: ' || nullif(new.project_description, '')),
         p.id, new.id, now() + interval '1 hour',
         'pending', 'high', p.org_id, false, 'quote_call_1',
         coalesce(auth.uid(), '55430c28-2445-44b1-bf6e-08756c87380e'::uuid)
    from profiles p
   where p.crm_team = 'cs'
     and p.org_id = new.org_id
     and coalesce(p.country, 'EG') = coalesce(new.country, 'EG');
  return new;
end $$;

drop trigger if exists leads_quote_call_tasks on leads;
create trigger leads_quote_call_tasks
  after insert or update of pipeline_stage on leads
  for each row execute function public.create_quote_call_tasks();

create or replace function public.close_sibling_call_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  -- Siblings closed below re-enter this trigger one level deeper; they must not
  -- close anything or spawn their own follow-ups.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.kind is null or new.kind not like 'quote_call_%'
     or old.status <> 'pending' or new.status <> 'done' or new.lead_id is null then
    return new;
  end if;

  select name into v_name from profiles where id = new.assigned_to;

  update tasks
     set status = 'done', completed_at = now(),
         description = concat_ws(E'\n', description, 'اتعملت بواسطة ' || coalesce(v_name, 'زميل'))
   where lead_id = new.lead_id and kind = new.kind
     and status = 'pending' and id <> new.id;

  -- Un-ticking and re-ticking the first call must not add a second follow-up.
  -- The first-call task was created the moment the lead became QUOTED, so its
  -- created_at is the quote time the 48 hours count from.
  if new.kind = 'quote_call_1' and new.assigned_to is not null
     and not exists (select 1 from tasks where lead_id = new.lead_id
                       and kind = 'quote_call_2' and created_at >= new.created_at) then
    insert into tasks (title, description, assigned_to, lead_id, due_date,
                       status, priority, org_id, auto_created, kind, created_by)
    values (replace(new.title, 'مكالمة عرض السعر', 'متابعة عرض السعر'),
            replace(new.description, 'كلمه خلال ساعة', 'مكالمة المتابعة بعد 48 ساعة من عرض السعر'),
            new.assigned_to, new.lead_id,
            greatest(new.created_at + interval '48 hours', now() + interval '1 hour'),
            'pending', 'medium', new.org_id, false, 'quote_call_2', new.created_by);
  end if;
  return new;
end $$;

drop trigger if exists tasks_close_sibling_calls on tasks;
create trigger tasks_close_sibling_calls
  after update of status on tasks
  for each row execute function public.close_sibling_call_tasks();
