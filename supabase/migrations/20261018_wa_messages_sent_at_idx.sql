-- Inbox query orders all lead messages by sent_at; without this it scanned + sorted
-- the whole table on every reload (disk-IO exhaustion 2026-10-18).
create index if not exists wa_messages_inbox_idx
  on public.wa_messages (sent_at desc) where lead_id is not null;
