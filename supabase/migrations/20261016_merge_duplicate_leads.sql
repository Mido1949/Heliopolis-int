-- Merge leads that share a phone_normalized into one survivor per phone.
-- Survivor = most activity (calls + activities + tasks); tie -> newest created_at.
-- Losers: notes/empty fields folded into the survivor, every child row moved
-- to the survivor, a snapshot kept in leads_archive (reason 'merged'), then deleted.
begin;

create temp table m on commit drop as
with d as (
  select l.id, l.phone_normalized p, l.created_at,
    (select count(*) from call_logs c where c.lead_id = l.id)
  + (select count(*) from lead_activities a where a.lead_id = l.id)
  + (select count(*) from tasks t where t.lead_id = l.id) as n
  from leads l
  where l.phone_normalized in (
    select phone_normalized from leads where phone_normalized is not null
    group by 1 having count(*) > 1)
), r as (
  select *, row_number() over (partition by p order by n desc, created_at desc) rk from d
)
select l.id loser, s.id survivor
from r l join r s on s.p = l.p and s.rk = 1
where l.rk > 1;

-- 1. Snapshot the losers before anything changes.
insert into leads_archive (id, lead, children, reason)
select l.id, to_jsonb(l), jsonb_build_object('merged_into', m.survivor), 'merged'
from leads l join m on m.loser = l.id;

-- 2. Fold loser data into the survivor.
update leads s set
  notes = nullif(concat_ws(E'\n---\n', s.notes, x.notes), ''),
  company = coalesce(nullif(s.company, ''), x.company),
  email = coalesce(nullif(s.email, ''), x.email),
  project_description = coalesce(nullif(s.project_description, ''), x.project_description),
  project_capacity = coalesce(nullif(s.project_capacity, ''), x.project_capacity),
  client_type = coalesce(s.client_type, x.client_type),
  deal_value = coalesce(s.deal_value, x.deal_value),
  assigned_to_user = coalesce(s.assigned_to_user, x.assigned_to_user),
  last_contact_date = greatest(s.last_contact_date, x.last_contact_date),
  next_follow_up = coalesce(s.next_follow_up, x.next_follow_up),
  created_at = least(s.created_at, x.created_at)
from (
  select m.survivor,
    string_agg(distinct nullif(trim(concat_ws(' | ',
      case when l.name <> sv.name then 'اسم آخر: ' || l.name end,
      nullif(l.notes, ''))), ''), E'\n---\n') notes,
    max(l.company) company, max(l.email) email,
    max(l.project_description) project_description, max(l.project_capacity) project_capacity,
    max(l.client_type) client_type, max(l.deal_value) deal_value,
    (array_agg(l.assigned_to_user) filter (where l.assigned_to_user is not null))[1] assigned_to_user,
    max(l.last_contact_date) last_contact_date, min(l.next_follow_up) next_follow_up,
    min(l.created_at) created_at
  from m join leads l on l.id = m.loser join leads sv on sv.id = m.survivor
  group by m.survivor
) x
where s.id = x.survivor;

-- 3. Move every child row to the survivor.
update call_logs           c set lead_id = m.survivor          from m where c.lead_id = m.loser;
update lead_activities     c set lead_id = m.survivor          from m where c.lead_id = m.loser;
update tasks               c set lead_id = m.survivor          from m where c.lead_id = m.loser;
update boqs                c set lead_id = m.survivor          from m where c.lead_id = m.loser;
update field_visits        c set lead_id = m.survivor          from m where c.lead_id = m.loser;
update wa_messages         c set lead_id = m.survivor          from m where c.lead_id = m.loser;
update after_sales_service c set lead_id = m.survivor          from m where c.lead_id = m.loser;
update email_recipients    c set lead_id = m.survivor          from m where c.lead_id = m.loser;
update agent_actions       c set target_lead_id = m.survivor   from m where c.target_lead_id = m.loser;
update scraped_leads       c set imported_lead_id = m.survivor from m where c.imported_lead_id = m.loser;
update website_inquiries   c set imported_lead_id = m.survivor from m where c.imported_lead_id = m.loser;

-- 4. Remove the losers.
delete from leads l using m where l.id = m.loser;

-- Check: dup_phones_left should be 0, merged should be 42.
select 'dup_phones_left' k, count(*) v from (
  select phone_normalized from leads where phone_normalized is not null
  group by 1 having count(*) > 1) d
union all
select 'merged', count(*) from leads_archive where reason = 'merged';

commit;
