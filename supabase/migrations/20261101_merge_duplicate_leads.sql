-- Merge EG leads that share a phone number (Mido, 2026-11-01: "merge them").
-- Keeper = the OLDEST lead per phone (the WhatsApp webhook already attaches new
-- messages to the oldest). It takes the most advanced stage / owner / value of
-- the group, and everyone's notes. Children move to the keeper. The copies are
-- archived (never deleted), their phone_normalized cleared so the one-row phone
-- lookups (intake dedupe, bot) stop tripping on two rows. lead_merges_20261101
-- records every pairing so a merge can be undone.

create table if not exists public.lead_merges_20261101 (
  keeper_id uuid not null,
  dup_id    uuid not null primary key,
  dup_row   jsonb not null,
  merged_at timestamptz not null default now()
);
alter table public.lead_merges_20261101 enable row level security;

do $$
declare
  g record;
  k public.leads%rowtype;
  b public.leads%rowtype;
  d record;
  rank_of constant jsonb := '{"LOST":0,"NEW":1,"QUOTED":2,"FOLLOW_UP":3,"NEGOTIATION":4,"WON":5}';
begin
  for g in
    select phone_normalized from public.leads
     where country = 'EG' and archived_at is null and coalesce(phone_normalized, '') <> ''
     group by 1 having count(*) > 1
  loop
    select * into k from public.leads
     where country = 'EG' and archived_at is null and phone_normalized = g.phone_normalized
     order by created_at asc limit 1;

    -- most advanced lead of the group (ties: the one with the most chat, then latest)
    select l.* into b from public.leads l
     where l.country = 'EG' and l.archived_at is null and l.phone_normalized = g.phone_normalized
     order by coalesce((rank_of ->> coalesce(l.pipeline_stage, 'NEW'))::int, 1) desc,
              (select count(*) from public.wa_messages w where w.lead_id = l.id) desc,
              l.updated_at desc limit 1;

    -- the busiest / most advanced copy's rep keeps the customer
    if b.id <> k.id and b.assigned_to_user is not null then
      update public.leads set assigned_to_user = b.assigned_to_user,
                              assigned_to_team = coalesce(b.assigned_to_team, assigned_to_team)
       where id = k.id;
    end if;

    if b.id <> k.id
       and coalesce((rank_of ->> coalesce(b.pipeline_stage,'NEW'))::int,1) > coalesce((rank_of ->> coalesce(k.pipeline_stage,'NEW'))::int,1) then
      update public.leads set
        pipeline_stage   = b.pipeline_stage,
        status           = b.status,
        stage_timestamps = coalesce(k.stage_timestamps, '{}'::jsonb) || coalesce(b.stage_timestamps, '{}'::jsonb),
        assigned_to_user = coalesce(b.assigned_to_user, k.assigned_to_user),
        assigned_to_team = coalesce(b.assigned_to_team, k.assigned_to_team),
        deal_value       = coalesce(b.deal_value, k.deal_value),
        lost_reason      = b.lost_reason
      where id = k.id;
    end if;

    for d in
      select * from public.leads
       where country = 'EG' and archived_at is null and phone_normalized = g.phone_normalized and id <> k.id
    loop
      insert into public.lead_merges_20261101 (keeper_id, dup_id, dup_row) values (k.id, d.id, to_jsonb(d));

      update public.leads set
        name  = case when coalesce(nullif(trim(name), ''), 'عميل واتساب') = 'عميل واتساب'
                     then coalesce(nullif(trim(d.name), ''), name) else name end,
        company             = coalesce(nullif(company, ''), d.company),
        email               = coalesce(nullif(email, ''), d.email),
        region              = coalesce(nullif(region, ''), d.region),
        client_type         = coalesce(nullif(client_type, ''), d.client_type),
        project_description = coalesce(nullif(project_description, ''), d.project_description),
        project_capacity    = coalesce(nullif(project_capacity, ''), d.project_capacity),
        deal_value          = coalesce(deal_value, d.deal_value),
        notes = case when coalesce(d.notes, '') = '' or coalesce(notes, '') like '%' || d.notes || '%' then notes
                     else concat_ws(E'\n— مدموج —\n', nullif(notes, ''), d.notes) end,
        updated_at = now()
      where id = k.id;

      update public.wa_messages         set lead_id = k.id          where lead_id = d.id;
      update public.tasks               set lead_id = k.id          where lead_id = d.id;
      update public.lead_activities     set lead_id = k.id          where lead_id = d.id;
      update public.call_logs           set lead_id = k.id          where lead_id = d.id;
      update public.boqs                set lead_id = k.id          where lead_id = d.id;
      update public.field_visits        set lead_id = k.id          where lead_id = d.id;
      update public.wa_bot_runs         set lead_id = k.id          where lead_id = d.id;
      update public.after_sales_service set lead_id = k.id          where lead_id = d.id;
      update public.email_recipients    set lead_id = k.id          where lead_id = d.id;
      update public.scraped_leads       set imported_lead_id = k.id where imported_lead_id = d.id;
      update public.website_inquiries   set imported_lead_id = k.id where imported_lead_id = d.id;
      update public.agent_actions       set target_lead_id = k.id   where target_lead_id = d.id;

      update public.leads set
        archived_at      = now(),
        phone_normalized = null,
        lost_reason      = 'مدموج في ليد أقدم بنفس الرقم ' || k.id::text
      where id = d.id;
    end loop;
  end loop;
end $$;

-- Ran 2026-11-01: 41 copies merged by exact phone_normalized, then a second pass
-- grouped by digits ('+2010…', '2010…', '010…' → '2010…'; keeper = the row already
-- in WhatsApp format, else the oldest; keeper's phone_normalized set to that form)
-- merged 13 more. Total 54 rows in lead_merges_20261101; 445 active EG leads left.
