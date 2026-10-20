-- 2026-10-20 (Mido): pipeline cut to NEW → QUOTED → NEGOTIATION → WON/LOST.
-- Old stages fold into the nearest new one.
update leads set pipeline_stage = 'NEW', status = 'New'
 where pipeline_stage in ('WELCOME_SENT', 'NO_RESPONSE', 'INTERESTED', 'PRICING');
update leads set pipeline_stage = 'NEGOTIATION', status = 'Negotiation'
 where pipeline_stage = 'POSTPONED';

-- A quote made for a lead (an uploaded quote PDF or a BOQ) moves it from NEW
-- to QUOTED, so the tech team no longer has to remember to.
create or replace function public.mark_lead_quoted(p_lead uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update leads
     set pipeline_stage = 'QUOTED', status = 'Quote Sent',
         stage_timestamps = coalesce(stage_timestamps, '{}'::jsonb) || jsonb_build_object('QUOTED', now()),
         updated_at = now()
   where id = p_lead and pipeline_stage = 'NEW';
end $$;

create or replace function public.quote_file_marks_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category = 'quote' and (new.metadata->>'lead_id') is not null then
    perform mark_lead_quoted((new.metadata->>'lead_id')::uuid);
  end if;
  return new;
end $$;
drop trigger if exists client_files_mark_quoted on client_files;
create trigger client_files_mark_quoted after insert on client_files
  for each row execute function public.quote_file_marks_lead();

create or replace function public.boq_marks_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null then perform mark_lead_quoted(new.lead_id); end if;
  return new;
end $$;
drop trigger if exists boqs_mark_quoted on boqs;
create trigger boqs_mark_quoted after insert or update of lead_id on boqs
  for each row execute function public.boq_marks_lead();
