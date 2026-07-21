-- leads_status_check only allowed the 5 statuses legacyStatusFor() used to
-- produce. Widening to all 10 (see lib/leads/stageStatus.ts) so the
-- reconciliation backfill and every writer's status mirror can set the
-- other 5 (Contacted, No Response, Pricing, Negotiation, Postponed).

alter table leads drop constraint if exists leads_status_check;

alter table leads add constraint leads_status_check
  check (status = any (array[
    'New', 'Contacted', 'No Response', 'Interested', 'Pricing',
    'Quote Sent', 'Negotiation', 'Won', 'Lost', 'Postponed'
  ]));

-- One-time reconciliation: pipeline_stage is canonical (see
-- lib/leads/stageStatus.ts). Corrects `status` wherever it disagrees with
-- pipeline_stage's mapping, for the 890 leads that predate the shared
-- writer fix (commit 1b686cd). Does not touch updated_at/stage_timestamps —
-- this is a data-hygiene correction, not a user action. Applied directly to
-- prod via Supabase MCP (confirmed 307 of 890 rows corrected, zero
-- pipeline_stage/status mismatches remain afterward); this file tracks it
-- in repo history.

update leads
set status = case pipeline_stage
  when 'NEW' then 'New'
  when 'WELCOME_SENT' then 'Contacted'
  when 'NO_RESPONSE' then 'No Response'
  when 'INTERESTED' then 'Interested'
  when 'PRICING' then 'Pricing'
  when 'QUOTED' then 'Quote Sent'
  when 'NEGOTIATION' then 'Negotiation'
  when 'WON' then 'Won'
  when 'LOST' then 'Lost'
  when 'POSTPONED' then 'Postponed'
  else status
end
where status is distinct from (
  case pipeline_stage
    when 'NEW' then 'New'
    when 'WELCOME_SENT' then 'Contacted'
    when 'NO_RESPONSE' then 'No Response'
    when 'INTERESTED' then 'Interested'
    when 'PRICING' then 'Pricing'
    when 'QUOTED' then 'Quote Sent'
    when 'NEGOTIATION' then 'Negotiation'
    when 'WON' then 'Won'
    when 'LOST' then 'Lost'
    when 'POSTPONED' then 'Postponed'
    else status
  end
);
