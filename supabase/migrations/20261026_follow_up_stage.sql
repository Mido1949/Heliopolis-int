-- 2026-10-26 (Mido): pipeline NEW → QUOTED → FOLLOW_UP → NEGOTIATION → WON/LOST.
-- The CS member who makes the quote call takes the lead into FOLLOW_UP and
-- owns it from then on; their 48-hour follow-up call rings a reminder when due.

alter table leads drop constraint leads_pipeline_stage_check;
alter table leads add constraint leads_pipeline_stage_check check (pipeline_stage = any (array[
  'NEW','WELCOME_SENT','NO_RESPONSE','INTERESTED','PRICING','QUOTED','FOLLOW_UP',
  'NEGOTIATION','WON','LOST','POSTPONED']));
alter table leads drop constraint leads_status_check;
alter table leads add constraint leads_status_check check (status = any (array[
  'New','Contacted','No Response','Interested','Pricing','Quote Sent','Follow Up',
  'Negotiation','Won','Lost','Postponed']));

-- The quote-call bell says what the task is for, not just "new task".
create or replace function public.notify_task_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is null or new.assigned_to = new.created_by then
    return new;
  end if;
  insert into notifications (user_id, title, body, type, reference_id, reference_type, org_id)
  select new.assigned_to,
         case new.kind
           when 'quote_call_1' then '📥 تم إضافة ليد جديد محتاج شرح عرض السعر'
           when 'quote_call_2' then '📅 متابعة عرض السعر بعد 48 ساعة'
           else '📝 مهمة جديدة' end,
         new.title, 'general',
         coalesce(new.lead_id, new.id), case when new.lead_id is null then 'task' else 'lead' end,
         p.org_id
  from profiles p
  where p.id = new.assigned_to and p.org_id is not null;
  return new;
end $$;

-- As 20261025_quoted_cs_call_tasks, plus: the first quote call done moves the
-- lead from QUOTED to FOLLOW_UP under the CS member who made it.
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

  if new.kind = 'quote_call_1' and new.assigned_to is not null then
    -- Only a lead still at QUOTED moves; one already negotiating or closed stays.
    update leads
       set pipeline_stage = 'FOLLOW_UP', status = 'Follow Up',
           assigned_to_user = new.assigned_to, assigned_to_team = 'cs',
           stage_timestamps = coalesce(stage_timestamps, '{}'::jsonb) || jsonb_build_object('FOLLOW_UP', now()),
           updated_at = now()
     where id = new.lead_id and pipeline_stage = 'QUOTED';
  end if;

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

-- A quote call that comes due rings its owner's bell once.
alter table tasks add column if not exists reminded_at timestamptz;

create or replace function public.remind_due_quote_calls() returns void
language plpgsql security definer set search_path = public as $$
begin
  with due as (
    update tasks set reminded_at = now()
     where kind like 'quote_call_%' and status = 'pending'
       and reminded_at is null and due_date <= now() and assigned_to is not null
    returning id, assigned_to, title, lead_id, org_id, kind
  )
  insert into notifications (user_id, title, body, type, reference_id, reference_type, org_id)
  select assigned_to,
         case kind when 'quote_call_2' then '⏰ جه ميعاد متابعة عرض السعر' else '⏰ مكالمة عرض السعر متأخرة' end,
         title, 'general', coalesce(lead_id, id), case when lead_id is null then 'task' else 'lead' end, org_id
    from due where org_id is not null;
end $$;

select cron.schedule('remind-due-quote-calls', '*/10 * * * *', 'select public.remind_due_quote_calls()');
