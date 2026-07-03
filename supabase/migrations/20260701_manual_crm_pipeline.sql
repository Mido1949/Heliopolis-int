-- Manual Collaborative CRM: unified 10-stage pipeline
-- 1. New columns
alter table leads add column if not exists lost_reason text;
alter table leads add column if not exists project_description text;

-- 2. Capture lost reason from the old lost-stage codes (before we remap them)
update leads set lost_reason = 'price'   where pipeline_stage = 'LOST_PRICE';
update leads set lost_reason = 'ghosted' where pipeline_stage = 'GHOSTED';

-- 3. Drop ANY existing check constraint on leads that references pipeline_stage
-- FIRST, so the remap updates below aren't rejected by the old (narrower) rule.
-- Name-agnostic — handles leads_pipeline_stage_check or any other name.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'leads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%pipeline_stage%'
  loop
    execute format('alter table leads drop constraint %I', c.conname);
  end loop;
end $$;

-- 4. Remap existing pipeline_stage values to the new set (constraint is gone now)
update leads set pipeline_stage = case pipeline_stage
  when 'CONTACTED'     then 'WELCOME_SENT'
  when 'ASSIGNED_TECH' then 'INTERESTED'
  when 'FOLLOW_UP'     then 'NEGOTIATION'
  when 'LOST_PRICE'    then 'LOST'
  when 'GHOSTED'       then 'LOST'
  else pipeline_stage
end
where pipeline_stage in ('CONTACTED','ASSIGNED_TECH','FOLLOW_UP','LOST_PRICE','GHOSTED');

update leads set pipeline_stage = 'NEW' where pipeline_stage is null;

-- 5. Add the new check constraint enforcing the unified 10-stage pipeline
alter table leads add constraint leads_pipeline_stage_check
  check (pipeline_stage in (
    'NEW','WELCOME_SENT','NO_RESPONSE','INTERESTED','PRICING',
    'QUOTED','NEGOTIATION','WON','LOST','POSTPONED'
  ));
