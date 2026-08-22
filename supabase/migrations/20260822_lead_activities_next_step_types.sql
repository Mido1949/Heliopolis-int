-- app/api/leads/[id]/next-step/route.ts logs 'next_step_set' and
-- 'next_step_done', but lead_activities_type_check never allowed them. The
-- route doesn't check that insert's error, so setting a next step created the
-- task and returned ok while its timeline entry was silently rejected —
-- confirmed in prod logs: every tasks row on 2026-08-22 has a matching
-- "violates check constraint lead_activities_type_check" within one second.

alter table lead_activities drop constraint if exists lead_activities_type_check;

alter table lead_activities add constraint lead_activities_type_check
  check (type = any (array[
    'creation', 'status_change', 'edit', 'call', 'note',
    'assignment', 'note_added', 'next_step_set', 'next_step_done'
  ]));
