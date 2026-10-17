-- WhatsApp media (photos, voice notes, videos, files) copied out of Meta on
-- first view: Meta deletes media after ~30 days. Private; only
-- /api/whatsapp/media reads it, with the service role, after checking the
-- viewer can see the message through lead RLS.
insert into storage.buckets (id, name, public)
values ('wa-media', 'wa-media', false)
on conflict (id) do nothing;
