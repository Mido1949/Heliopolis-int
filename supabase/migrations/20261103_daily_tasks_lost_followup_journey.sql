-- 2026-11-03 (Mido): fixes for the CS team's task list (Reem / Mona).
--
-- A. «متابعات اليوم» showed lost leads. The filter read the old `status` text
--    ('Won'/'Lost'), but a lead is closed by pipeline_stage = 'LOST'/'WON' and
--    its `status` stays 'New'/'Follow Up'. Merged duplicates showed too.
-- B. A lead the rep called and gave a far follow-up came back the next day:
--    the "no activity in 24h" branch ignored dates, and «الخطوة التالية» puts
--    its date on a task, not on leads.next_follow_up. Now a lead with an open
--    task is left to «مهامي» (it shows there on its due date), a lead with a
--    date shows when the date arrives, and "no activity" applies only to leads
--    with no date and no open task.
-- C. Each rep sees the lead's whole history in one line (`journey`).
-- D. The quote call went to every CS member; the first tick closed the other
--    copy as 'done', so a call Mona made showed as done under Reem too (and
--    counted for both), and the 48h follow-up went to whoever ticked first
--    even on the other rep's lead. Now the call goes to the lead's owner when
--    the owner is in CS (all of CS only when nobody in CS owns it), an
--    untouched copy closes as 'cancelled', and the follow-up goes to the owner.

-- ── C. one-line journey ────────────────────────────────────────────────────
create or replace function public.lead_journey(p_lead_id uuid) returns text
language sql stable set search_path = public as $$
  select concat_ws(' ← ',
    (select to_char(l.created_at at time zone 'Africa/Cairo', 'DD/MM') || ' دخل'
            || coalesce(' (' || nullif(l.source, '') || ')', '')
       from leads l where l.id = p_lead_id),
    (select string_agg(ev.line, ' ← ' order by ev.at)
       from (
         select a.created_at as at,
                to_char(a.created_at at time zone 'Africa/Cairo', 'DD/MM') || ' ' ||
                case a.type
                  when 'note_added' then
                    case a.details->>'outcome'
                      when 'Answered' then 'مكالمة رد'
                      when 'No Answer' then 'مكالمة مردش'
                      when 'Busy' then 'مكالمة مشغول'
                      when 'Callback Requested' then 'طلب يتكلم بعدين'
                      else coalesce(a.details->>'action', 'ملاحظة')
                    end
                    || coalesce(': ' || nullif(left(regexp_replace(a.details->>'notes', '\s+', ' ', 'g'), 70), ''), '')
                  when 'call' then 'مكالمة ' || coalesce(a.body, '')
                  when 'next_step_set' then 'الخطوة الجاية: ' || left(regexp_replace(coalesce(a.body, ''), '\s+', ' ', 'g'), 70)
                  when 'next_step_done' then left(regexp_replace(coalesce(a.body, ''), '\s+', ' ', 'g'), 70)
                end as line
           from lead_activities a
          where a.lead_id = p_lead_id
            and a.type in ('note_added', 'call', 'next_step_set', 'next_step_done')
            -- a logged call writes both 'call' and 'note_added'; keep the richer one
            and not (a.type = 'call' and exists (
                  select 1 from lead_activities n
                   where n.lead_id = a.lead_id and n.type = 'note_added'
                     and abs(extract(epoch from n.created_at - a.created_at)) < 300))
       ) ev),
    (select 'الفولو: ' || to_char(l.next_follow_up at time zone 'Africa/Cairo', 'DD/MM/YY')
       from leads l where l.id = p_lead_id and l.next_follow_up is not null)
  );
$$;

-- For task cards. Invoker rights: a rep only gets leads RLS lets them read.
create or replace function public.get_lead_journeys(p_lead_ids uuid[])
returns table(lead_id uuid, journey text)
language sql stable set search_path = public as $$
  select l.id, public.lead_journey(l.id) from leads l where l.id = any(p_lead_ids);
$$;
grant execute on function public.get_lead_journeys(uuid[]) to authenticated;

-- ── A + B. daily follow-ups ────────────────────────────────────────────────
drop function if exists public.get_daily_tasks(uuid);

create function public.get_daily_tasks(p_user_id uuid default null)
returns table(id uuid, name text, next_follow_up timestamptz, status text, reason text, journey text)
language sql stable security definer set search_path = public as $$
  with picked as (
    select l.id, l.name, l.next_follow_up, l.status, l.created_at,
           case when l.next_follow_up is not null and l.next_follow_up <= now()
                then 'overdue' else 'no_activity' end as reason
      from leads l
     where (p_user_id is null or l.assigned_to_user = p_user_id)
       and coalesce(l.pipeline_stage, '') not in ('WON', 'LOST')
       and coalesce(l.status, '') not in ('Won', 'Lost')
       and coalesce(l.lost_reason, '') not like 'مدموج في ليد أقدم%'
       and (l.updated_at is null or l.updated_at < now() - interval '24 hours')
       and not exists (select 1 from tasks t where t.lead_id = l.id and t.status = 'pending')
       and (
         (l.next_follow_up is not null and l.next_follow_up <= now())
         or (l.next_follow_up is null and not exists (
               select 1 from lead_activities la
                where la.lead_id = l.id and la.created_at > now() - interval '24 hours'))
       )
     order by (l.next_follow_up is not null and l.next_follow_up <= now()) desc,
              l.next_follow_up asc nulls last, l.created_at desc
     limit 50
  )
  select p.id, p.name, p.next_follow_up, p.status, p.reason, public.lead_journey(p.id)
    from picked p
   order by (p.reason = 'overdue') desc, p.next_follow_up asc nulls last, p.created_at desc;
$$;
grant execute on function public.get_daily_tasks(uuid) to authenticated;

-- ── D. quote call goes to the lead's owner ─────────────────────────────────
create or replace function public.create_quote_call_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner_cs boolean;
begin
  if new.pipeline_stage <> 'QUOTED'
     or (tg_op = 'UPDATE' and old.pipeline_stage = 'QUOTED') then
    return new;
  end if;
  if exists (select 1 from tasks
              where lead_id = new.id and kind = 'quote_call_1' and status = 'pending') then
    return new;
  end if;

  select exists (select 1 from profiles
                  where id = new.assigned_to_user and crm_team = 'cs')
    into v_owner_cs;

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
     and coalesce(p.country, 'EG') = coalesce(new.country, 'EG')
     and (not v_owner_cs or p.id = new.assigned_to_user);
  return new;
end $$;

create or replace function public.close_sibling_call_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_follow_to uuid;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.kind is null or new.kind not like 'quote_call_%'
     or old.status <> 'pending' or new.status <> 'done' or new.lead_id is null then
    return new;
  end if;

  select name into v_name from profiles where id = new.assigned_to;

  -- The other copies were not done by their owner: cancel, don't credit.
  update tasks
     set status = 'cancelled', completed_at = now(),
         description = concat_ws(E'\n', description, 'اتقفلت — عملتها ' || coalesce(v_name, 'زميلة'))
   where lead_id = new.lead_id and kind = new.kind
     and status = 'pending' and id <> new.id;

  -- Follow-up goes to the lead's owner when she is in CS, else to whoever called.
  select coalesce(
           (select p.id from leads l join profiles p on p.id = l.assigned_to_user
             where l.id = new.lead_id and p.crm_team = 'cs'),
           new.assigned_to)
    into v_follow_to;

  if new.kind = 'quote_call_1' and v_follow_to is not null
     and not exists (select 1 from tasks where lead_id = new.lead_id
                       and kind = 'quote_call_2' and created_at >= new.created_at) then
    insert into tasks (title, description, assigned_to, lead_id, due_date,
                       status, priority, org_id, auto_created, kind, created_by)
    values (replace(new.title, 'مكالمة عرض السعر', 'متابعة عرض السعر'),
            replace(new.description, 'كلمه خلال ساعة', 'مكالمة المتابعة بعد 48 ساعة من عرض السعر'),
            v_follow_to, new.lead_id,
            greatest(new.created_at + interval '48 hours', now() + interval '1 hour'),
            'pending', 'medium', new.org_id, false, 'quote_call_2', new.created_by);
  end if;
  return new;
end $$;

-- ── Backfill ───────────────────────────────────────────────────────────────
-- Copies closed by the other rep's tick were never done by their owner.
update tasks
   set status = 'cancelled',
       description = replace(description, 'اتعملت بواسطة', 'اتقفلت — عملتها')
 where kind like 'quote_call_%' and status = 'done'
   and description like '%اتعملت بواسطة%';

-- Open follow-ups sitting with the rep who doesn't own the lead.
update tasks t
   set assigned_to = l.assigned_to_user
  from leads l join profiles p on p.id = l.assigned_to_user
 where l.id = t.lead_id and p.crm_team = 'cs'
   and t.kind like 'quote_call_%' and t.status = 'pending'
   and t.assigned_to is distinct from l.assigned_to_user;
