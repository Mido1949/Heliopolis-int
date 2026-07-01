-- Manual Collaborative CRM: unified 10-stage pipeline
-- 1. New columns
alter table leads add column if not exists lost_reason text;
alter table leads add column if not exists project_description text;

-- 2. Remap existing pipeline_stage values to the new set
update leads set lost_reason = 'price'   where pipeline_stage = 'LOST_PRICE';
update leads set lost_reason = 'ghosted' where pipeline_stage = 'GHOSTED';

update leads set pipeline_stage = case pipeline_stage
  when 'ASSIGNED_TECH' then 'INTERESTED'
  when 'FOLLOW_UP'     then 'NEGOTIATION'
  when 'LOST_PRICE'    then 'LOST'
  when 'GHOSTED'       then 'LOST'
  else pipeline_stage
end
where pipeline_stage in ('ASSIGNED_TECH','FOLLOW_UP','LOST_PRICE','GHOSTED');

update leads set pipeline_stage = 'NEW' where pipeline_stage is null;

-- 3. Refresh the check constraint
alter table leads drop constraint if exists leads_pipeline_stage_check;
alter table leads add constraint leads_pipeline_stage_check
  check (pipeline_stage in (
    'NEW','WELCOME_SENT','NO_RESPONSE','INTERESTED','PRICING',
    'QUOTED','NEGOTIATION','WON','LOST','POSTPONED'
  ));
