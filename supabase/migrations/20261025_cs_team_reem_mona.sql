-- 2026-10-25 (Mido): esraa left the company and menna is moving to the Saudi
-- team, so the CS team is Reem and Mona only. Taking them off crm_team stops
-- the quote call tasks and team assignments reaching them; their accounts and
-- the leads already assigned to them are untouched.
update profiles set crm_team = null where name in ('esraa', 'menna') and crm_team = 'cs';

-- The two leads whose quotes were uploaded minutes before the auto-QUOTED
-- trigger existed (2026-10-20).
select mark_lead_quoted(id) from leads
 where id in ('07dfdb96-cc0e-48b7-a5c6-ad2d3fc7409f', '7b64621b-4c8b-4099-b2c4-6274ff6e9c9d');
