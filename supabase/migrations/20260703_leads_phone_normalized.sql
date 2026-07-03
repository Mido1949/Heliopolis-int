-- US6: phone dedupe. Add a normalized (E.164-style) match key on leads so that
-- e.g. +966501234567, 0501234567, and 966501234567 all collapse to one lead.
-- The column is populated by the app (lib/phone.ts / normalizePhone) on intake
-- and manual entry; existing rows are backfilled by a one-off script that uses
-- the SAME normalization (scripts/backfill-phone-normalized — libphonenumber-js).

alter table leads add column if not exists phone_normalized text;

create index if not exists leads_phone_normalized_idx on leads (phone_normalized);
