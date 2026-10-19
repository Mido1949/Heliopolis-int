-- Inbox query orders all lead messages by sent_at; without this it scanned + sorted
-- the whole table on every reload (disk-IO exhaustion 2026-10-18).
-- CONCURRENTLY: a plain build locks out WhatsApp inserts and stalled the whole app.
-- Run it on its own (not inside a transaction), off-hours.
create index concurrently if not exists wa_messages_inbox_idx
  on public.wa_messages (sent_at desc) where lead_id is not null;
