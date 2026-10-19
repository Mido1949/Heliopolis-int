-- Clean the pipeline: move every LOST lead (553 on 2026-10-15) out of `leads`
-- into an archive, and drop the WhatsApp test lead. Requested by Mido.
--
-- Nothing is lost: each archived lead keeps its full row plus a snapshot of
-- every row that pointed at it (call logs, BOQs, field visits, ...), found
-- from the foreign keys so a table added later is not missed.
-- Restore a lead with jsonb_populate_record(null::public.leads, lead).

create table if not exists public.leads_archive (
  id          uuid primary key,
  lead        jsonb not null,
  children    jsonb not null default '{}'::jsonb,
  reason      text not null,
  archived_at timestamptz not null default now()
);

-- Admin-only data: RLS on, no policies, so only the service role reads it.
alter table public.leads_archive enable row level security;

do $$
declare
  fk record;
begin
  -- 1. The WhatsApp test lead from Meta's dashboard sample.
  delete from public.wa_messages where customer_phone = '16315551181';
  delete from public.leads where phone_normalized = '16315551181' and name = 'test user name';

  -- 2. Snapshot the LOST leads.
  insert into public.leads_archive (id, lead, reason)
  select l.id, to_jsonb(l), 'lost'
    from public.leads l
   where l.pipeline_stage = 'LOST'
  on conflict (id) do nothing;

  -- 3. Snapshot every child row per foreign key, then free the lead.
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col,
           c.confdeltype as on_delete, a.attnotnull as not_null
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid = 'public.leads'::regclass
  loop
    execute format(
      'update public.leads_archive la
          set children = children || jsonb_build_object(%L,
                (select jsonb_agg(to_jsonb(t)) from %s t where t.%I = la.id))
        where la.reason = ''lost''
          and exists (select 1 from %s t where t.%I = la.id)',
      fk.tbl || '.' || fk.col, fk.tbl, fk.col, fk.tbl, fk.col);

    -- No-action / restrict FKs would block the delete: unlink the child, or
    -- remove it when the column is NOT NULL (it is already in the snapshot).
    if fk.on_delete in ('a', 'r') then
      if fk.not_null then
        execute format(
          'delete from %s t using public.leads_archive la where la.reason = ''lost'' and t.%I = la.id',
          fk.tbl, fk.col);
      else
        execute format(
          'update %s t set %I = null from public.leads_archive la where la.reason = ''lost'' and t.%I = la.id',
          fk.tbl, fk.col, fk.col);
      end if;
    end if;
  end loop;

  -- 4. Out of the pipeline.
  delete from public.leads l
   using public.leads_archive la
   where la.id = l.id and la.reason = 'lost';
end $$;

-- Check: lost_left 0, archived 553.
select
  (select count(*) from public.leads where pipeline_stage = 'LOST') as lost_left,
  (select count(*) from public.leads_archive where reason = 'lost') as archived,
  (select count(*) from public.leads) as leads_left;
